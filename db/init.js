/**
 * Initialize MongoDB Database
 * Run: node db/init.js
 * 
 * @description This database runs on seperate service that is configured 
 * in docker-compose file. 
 * 
 */

const { connect, disconnect } = require('./connection');
const { Place, Grid } = require('./models');

async function init() {
  await connect();
  
  try {
    console.log('🔧 Initializing database...');
    
    // Verify connection (no need to list collections)
    console.log('📦 Connected to MongoDB');
    
    // Insert test data
    console.log('\n📝 Inserting test data...');
    
    const testPlaces = [
      {
        place_id: 'ChIJ_test_restaurant_1',
        location: { lat: 45.5017, lng: -73.5673 },
        commodityTypes: ['restaurant', 'cafe'],
        geohash: 'f25dvr'
      },
      {
        place_id: 'ChIJ_test_gas_1',
        location: { lat: 45.5067, lng: -73.5623 },
        commodityTypes: ['gas_station'],
        geohash: 'f25dvs'
      },
      {
        place_id: 'ChIJ_test_grocery_1',
        location: { lat: 45.4967, lng: -73.5723 },
        commodityTypes: ['grocery'],
        geohash: 'f25dvq'
      },
      {
        place_id: 'ChIJ_test_pharmacy_1',
        location: { lat: 45.5117, lng: -73.5573 },
        commodityTypes: ['pharmacy', 'cafe'],
        geohash: 'f25dvv'
      }
    ];
    
    // Insert places (ignore duplicates)
    const insertedPlaces = await Place.insertMany(testPlaces, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        console.log('ℹ️  Some places already exist, skipping duplicates');
        return [];
      }
      throw err;
    });
    
    if (insertedPlaces.length > 0) {
      console.log(`✅ Inserted ${insertedPlaces.length} test places`);
    }
    
    // Insert test grid
    const testGrid = {
      geohash: 'f25dvr',
      centerLat: 45.5017,
      centerLng: -73.5673,
      fetchStatus: 'cached',
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };
    
    const gridResult = await Grid.updateOne(
      { geohash: 'f25dvr' },
      testGrid,
      { upsert: true }
    );
    
    if (gridResult.upsertedId) {
      console.log('✅ Inserted test grid');
    } else {
      console.log('ℹ️  Test grid already exists');
    }
    
    // Display summary
    console.log('\n📊 Database Summary:');
    const placesCount = await Place.countDocuments();
    const gridsCount = await Grid.countDocuments();
    console.log(`  Total places: ${placesCount}`);
    console.log(`  Total grids: ${gridsCount}`);
    
    const placesByCommodity = await Place.aggregate([
      { $unwind: '$commodityTypes' },
      { $group: { _id: '$commodityTypes', count: { $sum: 1 } } }
    ]);
    
    console.log('  Places by commodity:');
    placesByCommodity.forEach(item => {
      console.log(`    - ${item._id}: ${item.count}`);
    });
    
    console.log('\n✅ Database initialized successfully');
    
  } catch (error) {
    console.error('❌ Initialization error:', error.message);
  } finally {
    await disconnect();
  }
}

init();
