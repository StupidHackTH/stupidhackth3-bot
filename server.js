// server.js
// where your node app starts

// init project
const express = require('express');
const app = express();

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

const base = require('airtable').base('appGku14IaF3SIUts');

app.use(express.static('public'));
app.use(require('body-parser').json());

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/views/index.html');
});

app.post('/team', function(req, res) {
  console.log(req.body);
  res.json({ });
});

const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
