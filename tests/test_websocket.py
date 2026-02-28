import asyncio
import websockets
import json
import sys
from datetime import datetime

async def test_websocket():
    # Get URL from command line or use default
    uri = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:3000"
    
    print(f"Testing WebSocket connection to: {uri}")
    print("-" * 43)

    try:
        # Connect to the server
        async with websockets.connect(uri) as ws:
            print("✅ WebSocket connected successfully!")
            print(f"   Connected to: {uri}")

            # Send a ping
            ping_message = json.dumps({"type": "ping"})
            await ws.send(ping_message)
            print(f"📤 Sent ping message: {ping_message}")

            # Listen for messages in a loop
            async for message in ws:
                timestamp = datetime.now().isoformat()
                print(f"\n📥 [{timestamp}] Received message:")
                print(f"   Raw: {message}")

                try:
                    data = json.loads(message)
                    print(f"   Type: {data.get('type', 'unknown')}")
                    # Pretty print the JSON data
                    print(f"   Data: {json.dumps(data.get('data', data), indent=2)}")
                except json.JSONDecodeError:
                    print("   (Not JSON format)")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"\n🔌 WebSocket connection closed")
        print(f"   Code: {e.code}")
        print(f"   Reason: {e.reason or 'No reason provided'}")
    except Exception as e:
        print(f"\n❌ WebSocket error:")
        print(f"   Message: {str(e)}")
    finally:
        print("-" * 43)

async def main():
    try:
        # Wrap the test in a 30-second timeout
        await asyncio.wait_for(test_websocket(), timeout=30.0)
    except asyncio.TimeoutError:
        print("\n⏱️  Test timeout (30s), closing connection...")
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user, closing...")

if __name__ == "__main__":
    asyncio.run(main())