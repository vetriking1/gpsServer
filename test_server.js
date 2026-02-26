const net = require("net");

const PROXY_IP = "31.97.229.169"; // Use your Public IP here
const PROXY_PORT = 5000; // Nginx's entry port

const client = new net.Socket();

client.connect(PROXY_PORT, PROXY_IP, () => {
  console.log(`Connected to Nginx on port ${PROXY_PORT}!`);

  // Login Packet
  const login = Buffer.from("78780D01012345678901234500018CDD0D0A", "hex");
  client.write(login);
});

client.on("data", (data) => {
  console.log("Server Replied:", data.toString("hex").toUpperCase());

  // Once we get the Login ACK, send a Location packet
  const loc = Buffer.from(
    "78781F120B081D112E10CC027AC7EB0C46584900148F01CC00287D001FB8000380810D0A",
    "hex",
  );
  console.log("Sending Location...");
  client.write(loc);
});

client.on("close", () => console.log("Connection closed by server/proxy."));
