import React from "react";
import ReactDOM from "react-dom/client";
// import "./index.css"; // اگر CSS داری، import کن
import App from "./poupe/App"; // Import از poupe/App.tsx

const container = document.getElementById("root");
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
