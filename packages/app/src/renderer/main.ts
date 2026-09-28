// Renderer entry. The UI starts here.
const socket = new WebSocket(window.hone.getHostConnection());
socket.addEventListener("open", () => {
  document.body.textContent = "Connected to host";
});
