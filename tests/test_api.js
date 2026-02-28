// API Test Script
// Run with: node test_api.js

const BASE_URL = 'http://31.97.229.169/api/gps';

async function testAPI() {
    console.log('🧪 Testing GPS Tracker API...\n');
    
    try {
        // 1. Health Check
        console.log('1️⃣  Testing Health Check...');
        const health = await fetch(`${BASE_URL}/health`);
        console.log('✅ Health:', await health.json());
        console.log('');
        
        // 2. Get Vehicles
        console.log('2️⃣  Testing Get Vehicles...');
        const vehicles = await fetch(`${BASE_URL}/vehicles`);
        const vehiclesData = await vehicles.json();
        console.log(`✅ Found ${vehiclesData.length} vehicles`);
        if (vehiclesData.length > 0) {
            console.log('   First vehicle:', vehiclesData[0].vehicle_number);
        }
        console.log('');
        
        // 3. Get Live Locations
        console.log('3️⃣  Testing Live Locations...');
        const liveLocations = await fetch(`${BASE_URL}/locations/live`);
        const locationsData = await liveLocations.json();
        console.log(`✅ ${locationsData.length} vehicles with live locations`);
        console.log('');
        
        // 4. Get Live Fuel
        console.log('4️⃣  Testing Live Fuel...');
        const liveFuel = await fetch(`${BASE_URL}/fuel/live`);
        const fuelData = await liveFuel.json();
        console.log(`✅ ${fuelData.length} vehicles with fuel data`);
        console.log('');
        
        // 5. Get Geofences
        console.log('5️⃣  Testing Geofences...');
        const geofences = await fetch(`${BASE_URL}/geofences`);
        const geofencesData = await geofences.json();
        console.log(`✅ Found ${geofencesData.length} geofences`);
        console.log('');
        
        // 6. Dashboard Analytics
        console.log('6️⃣  Testing Dashboard Analytics...');
        const dashboard = await fetch(`${BASE_URL}/analytics/dashboard`);
        const dashboardData = await dashboard.json();
        console.log('✅ Dashboard:', dashboardData);
        console.log('');
        
        // 7. Test Create Geofence
        console.log('7️⃣  Testing Create Geofence...');
        const newGeofence = await fetch(`${BASE_URL}/geofences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Warehouse',
                description: 'Test geofence created by API test',
                fence_type: 'circle',
                center_lat: 13.0827,
                center_lon: 80.2707,
                radius_meters: 500
            })
        });
        
        if (newGeofence.ok) {
            const geofenceResult = await newGeofence.json();
            console.log('✅ Geofence created:', geofenceResult.name);
            
            // Clean up - delete the test geofence
            await fetch(`${BASE_URL}/geofences/${geofenceResult.id}`, {
                method: 'DELETE'
            });
            console.log('   (Test geofence deleted)');
        } else {
            console.log('⚠️  Could not create geofence:', newGeofence.status);
        }
        console.log('');
        
        // 8. Test Vehicle Update (if vehicles exist)
        if (vehiclesData.length > 0) {
            console.log('8️⃣  Testing Vehicle Update...');
            const vehicleId = vehiclesData[0].id;
            const updateResult = await fetch(`${BASE_URL}/vehicles/${vehicleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driver_name: 'Test Driver (Updated)'
                })
            });
            
            if (updateResult.ok) {
                const updated = await updateResult.json();
                console.log('✅ Vehicle updated:', updated.vehicle_number);
            } else {
                console.log('⚠️  Could not update vehicle:', updateResult.status);
            }
            console.log('');
        }
        
        console.log('✨ All tests completed!\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n⚠️  Make sure the server is running and accessible at http://31.97.229.169/api/gps');
    }
}

// Run tests
testAPI();
