// server.js
// where your node app starts

// init project
const express = require('express');
const app = express();

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

const base = require('airtable').base('appGku14IaF3SIUts');

app.use(express.static('public'));
app.use(require('body-parser').urlencoded({ extended: false }));

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/views/index.html');
});

const getNextTeamNumber = (() => {
  let firstPromise
  let nextNumber
  async function getTeams() {
    return (await base('Teams').select().all()).length
  }
  return async () => {
    if (!nextNumber) {
      const firstNumber = 1 + (await (firstPromise || (firstPromise = getTeams())))
      if (!nextNumber) nextNumber = firstNumber
    }
    return nextNumber++
  }
})()

app.post('/team', async function(req, res, next) {
  try {
    const teamNumber = await getNextTeamNumber();
    const out = [req.body.user_id];
    req.body.text.replace(/<@(U\w+)/g, (a, x) => out.push(x));
    if (out.length < 3) {
      res.json({
        response_type: "ephemeral",
        text: `Sorry, cannot create team as you need at least 3 members (${out.length} found).`
      });
      return
    }
    const data = {
      Name: `New Team ${teamNumber}`,
      Participants: out.join(','),
    };
    await base('Teams').create(data);
    res.json({
      response_type: "in_channel",
      text: `OK, created team "${data.Name}" with ${out.map(x => `<@${x}>`).join(', ')}.`
    });
  } catch (err) {
    next(err);
  }
});

const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
