// Tiny starter to prove scripts are running, then render the full app UI
const { useEffect, useMemo, useState } = React;

function App() {
  const [apiBase, setApiBase] = useState(
    localStorage.getItem("apiBase") || "https://factory-labour-logger-backend.onrender.com"
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [status, setStatus] = useState("");
  const [auth, setAuth] = useState({ user: null, token: null });

  useEffect(() => { localStorage.setItem("apiBase", apiBase); }, [apiBase]);

  async function checkHealth() {
    setStatus("Checking /health …");
    try {
      const r = await fetch(apiBase.replace(/\/+$/, "") + "/health");
      const j = await r.json();
      setStatus("Backend health: " + JSON.stringify(j));
    } catch (e) {
      setStatus("Health check failed: " + e.message);
    }
  }

  async function login() {
    setStatus("Signing in …");
    try {
      const body = new URLSearchParams();
      body.set("username", loginEmail);
      body.set("password", loginPass);
      const r = await fetch(apiBase.replace(/\/+$/, "") + "/auth/login", { method: "POST", body });
      if (!r.ok) throw new Error((await r.text()) || r.statusText);
      const j = await r.json();
      setAuth({ user: j.user, token: j.token });
      setStatus("Signed in ✔");
    } catch (e) {
      setStatus("Login failed: " + e.message);
    }
  }

  function logout() {
    setAuth({ user: null, token: null });
    setStatus("Signed out");
  }

  return React.createElement(
    "div",
    { className: "max-w-2xl mx-auto p-6 space-y-4" },
    React.createElement("h1", { className: "text-2xl font-bold" }, "Factory Labour Logger"),
    React.createElement(
      "div",
      { className: "p-4 bg-white rounded-xl shadow border space-y-2" },
      React.createElement("label", { className: "block text-sm font-medium" }, "API base URL"),
      React.createElement("input", {
        className: "w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",
        value: apiBase,
        onChange: (e) => setApiBase(e.target.value),
      }),
      React.createElement(
        "div",
        { className: "flex gap-2" },
        React.createElement(
          "button",
          { className: "px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50", onClick: checkHealth },
          "Check backend /health"
        )
      )
    ),
    !auth.user
      ? React.createElement(
          "div",
          { className: "p-4 bg-white rounded-xl shadow border space-y-2" },
          React.createElement("div", { className: "font-medium mb-1" }, "Sign in"),
          React.createElement("input", {
            placeholder: "email",
            className: "w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",
            value: loginEmail,
            onChange: (e) => setLoginEmail(e.target.value),
          }),
          React.createElement("input", {
            type: "password",
            placeholder: "password",
            className: "w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",
            value: loginPass,
            onChange: (e) => setLoginPass(e.target.value),
          }),
          React.createElement(
            "button",
            { className: "px-3 py-2 rounded-xl bg-slate-900 text-white", onClick: login },
            "Sign in"
          ),
          React.createElement(
            "div",
            { className: "text-xs text-slate-500" },
            "Use your admin: mark@argand.ie / ArgandA3!"
          )
        )
      : React.createElement(
          "div",
          { className: "p-4 bg-white rounded-xl shadow border space-y-2" },
          React.createElement("div", null, "Signed in as ", React.createElement("strong", null, auth.user.name), " (", auth.user.role, ")"),
          React.createElement(
            "button",
            { className: "px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50", onClick: logout },
            "Sign out"
          )
        ),
    status && React.createElement("div", { className: "text-sm text-slate-700" }, status)
  );
}

// Remove the boot placeholder and mount React
const boot = document.getElementById("boot");
if (boot) boot.remove();
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
