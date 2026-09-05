package org.siwd.authenticator.ui

import android.content.Context
import android.text.InputType
import android.text.TextWatcher
import android.text.Editable
import android.text.method.PasswordTransformationMethod
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.widget.EditText
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView

/** Password input even when visually revealed; no autofill, saved state,
 * suggestions, personalized learning or full-screen IME extraction. */
class PrivateEditText(context: Context) : EditText(context) {
    init {
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        isSaveEnabled = false
        setSingleLine(true)
        imeOptions = EditorInfo.IME_ACTION_DONE or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING or
            EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN
    }
    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs)
        outAttrs.imeOptions = outAttrs.imeOptions or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING or
            EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN
        return connection
    }
}

@Composable
fun PrivateTextField(value: String, onValueChange: (String) -> Unit, visible: Boolean, enabled: Boolean,
                     modifier: Modifier = Modifier) {
    val color = MaterialTheme.colorScheme.onSurface.toArgb()
    AndroidView(modifier = modifier, factory = { context ->
        PrivateEditText(context).apply {
            hint = "BIP-39 passphrase (optional)"
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { onValueChange(s?.toString().orEmpty()) }
                override fun afterTextChanged(s: Editable?) {}
            })
        }
    }, update = { field ->
        field.setTextColor(color)
        field.setHintTextColor(color)
        field.isEnabled = enabled
        val transformation = if (visible) null else PasswordTransformationMethod.getInstance()
        if (field.transformationMethod != transformation) field.transformationMethod = transformation
        if (field.text.toString() != value) { field.setText(value); field.setSelection(value.length) }
    }, onRelease = { field -> field.text.clear() })
}
