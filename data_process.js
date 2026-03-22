/**
 * Processes raw hex strings from RV08 (GT06 Protocol)
 * @param {string} hex - The raw hex string from the tracker
 */

function getFuelLevel(voltage) {
  const minVolts = 0; // Empty tank voltage (example)
  const maxVolts = 5; // Full tank voltage (example)
  let percentage = ((voltage - minVolts) / (maxVolts - minVolts)) * 100;
  return Math.max(0, Math.min(100, percentage)).toFixed(1) + "%";
}

function processRawData(hex) {
  const data = Buffer.from(hex, "hex");

  // Basic Header Check
  if (data[0] !== 0x78 || data[1] !== 0x78) {
    return { error: "Invalid Start Bit" };
  }

  const protocol = data[3];
  const result = {
    protocol: `0x${protocol.toString(16).toUpperCase()}`,
    serialNumber: data.readUInt16BE(data.length - 6),
  };

  switch (protocol) {
    case 0x94: // ANALOG / FUEL DATA
      // Information Content is 2 bytes starting at index 4
      const rawValue = data.readUInt16BE(4);
      result.type = "Fuel/Analog";
      result.rawData = rawValue;
      // Typical conversion: 0x0AF0 = 2800 -> 2.8V
      result.voltage = rawValue / 100;
      result.fuelLevel = getFuelLevel(rawValue / 1000);
      break;

    case 0x12: // LOCATION DATA
      result.type = "Location";

      // 1. Date and Time
      const date = {
        year: 2000 + data[4],
        month: data[5],
        day: data[6],
        hour: data[7],
        minute: data[8],
        second: data[9],
      };
      result.timestamp = `${date.year}-${date.month}-${date.day} ${date.hour}:${date.minute}:${date.second}`;

      // 2. Satellites
      const satByte = data[10];
      result.satellites = satByte & 0x0f; // Low 4 bits

      // 3. Coordinates (Raw / 1,800,000)
      result.latitude = data.readUInt32BE(11) / 1800000;
      result.longitude = data.readUInt32BE(15) / 1800000;

      // 4. Speed (km/h)
      result.speed = data[19];

      // 5. Course and Status
      const courseStatus = data.readUInt16BE(20);
      result.course = courseStatus & 0x03ff; // Last 10 bits
      break;

    default:
      result.type = "Unknown";
      result.rawHex = hex;
  }

  return result;
}

// --- TEST CASE 1: Fuel/Analog Packet ---
const fuelHex = "78780794000002c55a4a0d0a";
console.log("Fuel Result:", processRawData(fuelHex));

// --- TEST CASE 2: Location Packet ---
const locHex =
  "78781F121A021A0B2628CB0166F383089C3A1B0014000194280229008E780070C9020D0A";
console.log("Location Result:", processRawData(locHex));
