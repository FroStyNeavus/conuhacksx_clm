const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const DataManager = require('./db/DatabaseManager');
const { connect } = require('./db/connection');

const PORT = process.env.PORT || 9000;
const dataManager = new DataManager();

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    console.log(`[${req.method}] ${req.url}`);
    console.log(`Pathname: ${pathname}`);

    // Handle API routes
    if (pathname === '/api/commodities') {
        console.log('API route matched');
        res.setHeader('Content-Type', 'application/json');
        
        try {
            const lat = parseFloat(query.lat);
            const lng = parseFloat(query.lng);
            const radius = parseFloat(query.radius);
            
            // Map form field names to Google Places API types
            const typeMapping = {
                'restaurant': 'restaurant',
                'gas': 'gas_station',
                'grocery': 'supermarket',
                'pharmacy': 'pharmacy',
                'school': 'school'
            };
            
            // Get commodity types from query or use defaults
            const defaultTypes = Object.values(typeMapping);
            const requestedTypes = query.types 
                ? query.types.split(',').map(t => t.trim()) 
                : [];
            
            // Map form names to API types
            const commodityTypes = requestedTypes.length > 0
                ? requestedTypes.map(t => typeMapping[t] || t).filter(Boolean)
                : defaultTypes;

            console.log(`API request: lat=${lat}, lng=${lng}, radius=${radius}, types=[${commodityTypes.join(', ')}]`);

            if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid parameters: lat, lng, and radius must be numbers' }));
                return;
            }

            // Fetch data for each commodity type and aggregate
            let allPlaces = [];
            for (const commodityType of commodityTypes) {
                console.log(`Fetching ${commodityType}...`);
                const data = await dataManager.fetchData(lat, lng, radius, commodityType);

                const source = data.newGrids && data.newGrids.length > 0 ? 'API' : 'CACHE';
                console.log(`Fetched ${data.count} places for type ${commodityType} from ${source} (cached: ${data.cachedGrids.length}, new: ${data.newGrids.length})`);
                allPlaces = allPlaces.concat(data.places || []);
            }
            
            //Remove duplicates by place ID
            const uniquePlaces = [];
            const seenIds = new Set();
            for (const place of allPlaces) {
                if (!seenIds.has(place._id)) {
                    uniquePlaces.push(place);
                    seenIds.add(place._id);
                }
            }
            
            console.log(`API response: ${uniquePlaces.length} unique places found`);
            res.statusCode = 200;
            res.end(JSON.stringify({ places: uniquePlaces }));
        } catch (error) {
            console.error('API error:', error.message);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // Serve static files from the web directory
    let filePath = pathname === '/' ? 'index.html' : pathname;
    filePath = path.join(__dirname, 'web', filePath);
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath);
        let contentType = 'text/plain';
        if (ext === '.html') contentType = 'text/html';
        else if (ext === '.css') contentType = 'text/css';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.svg') contentType = 'image/svg+xml';

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.end(content);
    });
});

server.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    await connect();
});


