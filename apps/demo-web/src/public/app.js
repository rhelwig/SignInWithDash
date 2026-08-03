/* Minimal client helpers: copy link + poll auth status + finish. */
(function () {
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches("[data-copy]")) return;
    var sel = t.getAttribute("data-copy");
    var el = sel ? document.querySelector(sel) : null;
    if (!el) return;
    var text = el.value || el.textContent || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        t.textContent = "Copied";
        setTimeout(function () {
          t.textContent = "Copy";
        }, 1500);
      });
    } else {
      el.select && el.select();
      document.execCommand("copy");
    }
  });

  var root = $("#auth-flow");
  if (!root) return;

  var requestId = root.getAttribute("data-request-id");
  var statusEl = $("#auth-status");
  var detailEl = $("#auth-detail");
  if (!requestId || !statusEl) return;

  var done = false;
  var started = Date.now();

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "auth-status " + (cls || "");
  }

  function poll() {
    if (done) return;
    fetch("/dash-auth/v1/status?requestId=" + encodeURIComponent(requestId), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          if (res.status === 401) {
            setStatus("Binding cookie missing — restart login", "error");
            done = true;
            return;
          }
          throw new Error(res.body && res.body.error && res.body.error.message);
        }
        var st = res.body.status;
        if (st === "pending") {
          setStatus("Waiting for phone approval…", "pending");
          var exp = res.body.expiresAt ? new Date(res.body.expiresAt) : null;
          if (exp && detailEl) {
            var sec = Math.max(0, Math.floor((exp - Date.now()) / 1000));
            detailEl.textContent = "Expires in " + sec + "s";
          }
          schedule();
          return;
        }
        if (st === "approved" || res.body.finishReady) {
          setStatus("Approved — finishing…", "approved");
          return finish();
        }
        if (st === "expired" || st === "cancelled" || st === "rejected") {
          setStatus("Login " + st, "error");
          done = true;
          return;
        }
        if (st === "consumed") {
          setStatus("Already finished", "approved");
          done = true;
          window.location.href = "/me";
          return;
        }
        schedule();
      })
      .catch(function (err) {
        if (detailEl) detailEl.textContent = String(err.message || err);
        schedule();
      });
  }

  function finish() {
    fetch("/dash-auth/v1/finish", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ requestId: requestId }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          setStatus(
            "Finish failed: " +
              ((res.body.error && res.body.error.message) || "error"),
            "error",
          );
          done = true;
          return;
        }
        setStatus("Signed in", "approved");
        done = true;
        window.location.href = res.body.redirect || "/me";
      })
      .catch(function (err) {
        setStatus("Finish error", "error");
        if (detailEl) detailEl.textContent = String(err.message || err);
        done = true;
      });
  }

  function schedule() {
    if (done) return;
    if (Date.now() - started > 5 * 60 * 1000) {
      setStatus("Timed out waiting", "error");
      done = true;
      return;
    }
    setTimeout(poll, 1500);
  }

  poll();
})();
