const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 9000;

const server = http.createServer((req, res) => {
    // Serve static files from the web directory
    let filePath = req.url === '/' ? 'index.html' : req.url;
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

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});


