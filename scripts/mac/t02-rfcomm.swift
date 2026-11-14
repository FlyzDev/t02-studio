// Native macOS Bluetooth transport: reads T02 raster bytes on stdin.
import Foundation
import IOBluetooth

final class RFCOMMDelegate: NSObject, IOBluetoothRFCOMMChannelDelegate {
    func rfcommChannelData(_ rfcommChannel: IOBluetoothRFCOMMChannel!, data dataPointer: UnsafeMutableRawPointer!, length dataLength: Int) {}
}
func fail(_ message: String, code: Int32 = 1) -> Never {
    fputs("t02-rfcomm: \(message)\n", stderr)
    exit(code)
}
guard CommandLine.arguments.count == 2 else { fail("expected Bluetooth address", code: 2) }
let address = CommandLine.arguments[1]
guard address.range(of: #"^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$"#, options: .regularExpression) != nil else { fail("invalid Bluetooth address", code: 2) }
let data = FileHandle.standardInput.readDataToEndOfFile()
guard data.count >= 16 && data.count <= 450_000 && data.starts(with: [0x1b, 0x40, 0x1b, 0x61, 0x01]) else { fail("invalid T02 raster stream", code: 2) }
guard let device = IOBluetoothDevice(addressString: address) else { fail("T02 not found by macOS Bluetooth") }
let connect = device.openConnection()
guard connect == 0 else { fail(String(format:"Bluetooth connection failed (0x%08X)", connect)) }
defer { _ = device.closeConnection() }
let delegate = RFCOMMDelegate()
var opened: IOBluetoothRFCOMMChannel?
let result = device.openRFCOMMChannelSync(&opened, withChannelID: 1, delegate: delegate)
guard result == 0, let channel = opened, channel.isOpen() else { fail(String(format:"RFCOMM channel 1 failed (0x%08X)", result)) }
defer { _ = channel.close() }
data.withUnsafeBytes { raw in
    guard let base = raw.baseAddress else { return }
    var offset = 0
    while offset < data.count {
        let count = min(256, data.count - offset)
        let pointer = UnsafeMutableRawPointer(mutating: base.advanced(by: offset))
        let status = channel.writeSync(pointer, length: UInt16(count))
        guard status == 0 else { fail(String(format:"write failed after %d bytes (0x%08X)", offset, status)) }
        offset += count
        usleep(40_000)
    }
}
usleep(400_000)
print("SENT_BYTES=\(data.count)")
