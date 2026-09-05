package org.siwd.authenticator.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import org.siwd.protocol.Bip39

/** The mnemonic never enters an Android input connection or keyboard dictionary.
 * Suggestions come exclusively from the bundled BIP-39 list, without a network.
 * Intentionally remember (not rememberSaveable): no secrets in saved UI state.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecoveryWordEntry(phrase: String, onChange: (String) -> Unit, visible: Boolean, enabled: Boolean, onReadyChange: (Boolean) -> Unit) {
    var prefix by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(prefix, editing) { onReadyChange(prefix.isEmpty() && editing == null) }
    val words = phrase.split(' ').filter { it.isNotEmpty() }
    val suggestions = remember(prefix) {
        if (prefix.isEmpty()) emptyList() else Bip39.WORD_LIST.filter { it.startsWith(prefix) }.take(8)
    }
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    fun localInput() { focus.clearFocus(); keyboard?.hide() }
    LaunchedEffect(phrase) { if (phrase.isEmpty()) { prefix = ""; editing = null } }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("${words.size} words entered · tap a numbered word to correct it")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            words.forEachIndexed { index, word ->
                OutlinedButton(enabled = enabled, onClick = {
                    localInput(); editing = index; prefix = word
                }, contentPadding = PaddingValues(horizontal = 8.dp)) {
                    Text("${index + 1}. ${if (visible) word else "••••"}")
                }
            }
        }
        OutlinedTextField(
            value = prefix, onValueChange = {}, readOnly = true, enabled = enabled,
            label = { Text("Word ${(editing ?: words.size) + 1}") },
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(), singleLine = true,
        )
        Text("Use the letter buttons, then tap the matching word. Suggestions stay inside this app.",
            style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            suggestions.forEach { word ->
                SuggestionChip(enabled = enabled && (words.size < 24 || editing != null),
                    onClick = {
                        localInput()
                        val next = words.toMutableList()
                        val index = editing
                        if (index != null) next[index] = word else next.add(word)
                        onChange(next.joinToString(" ")); prefix = ""; editing = null
                    }, label = { Text(word) })
            }
        }
        if (prefix.isNotEmpty() && suggestions.isEmpty()) Text("No matching BIP-39 word", color = MaterialTheme.colorScheme.error)
        listOf("qwertyuiop", "asdfghjkl", "zxcvbnm").forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                row.forEach { letter ->
                    FilledTonalButton(enabled = enabled && prefix.length < 8 && (words.size < 24 || editing != null),
                        onClick = { localInput(); prefix += letter },
                        contentPadding = PaddingValues(0.dp), modifier = Modifier.weight(1f).height(44.dp)) {
                        Text(letter.toString())
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(enabled = enabled && prefix.isNotEmpty(), onClick = { localInput(); prefix = prefix.dropLast(1) }) { Text("Backspace") }
            if (editing != null) {
                TextButton(enabled = enabled, onClick = { localInput(); prefix = ""; editing = null }) { Text("Cancel edit") }
            } else {
                TextButton(enabled = enabled && words.isNotEmpty(), onClick = {
                    localInput(); onChange(words.dropLast(1).joinToString(" ")); prefix = ""
                }) { Text("Remove last word") }
            }
        }
    }
}
