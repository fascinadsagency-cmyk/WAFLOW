// Entry: carga el shim de storage antes que App, y renderiza App.jsx
import "./storage-shim";
import App from "./App.jsx";
import "./App.css";

export default App;
