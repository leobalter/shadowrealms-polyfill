const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();

app.use(
    helmet({
        contentSecurityPolicy: false,
    })
);

app.use('/', express.static(path.join(__dirname, 'src')));

app.listen(3000);

console.log('http://localhost:3000');

