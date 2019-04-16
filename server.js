// server.js
// where your node app starts

// init project
const express = require('express')
const app = express()
const axios = require('axios')

// we've started you off with Express,
// but feel free to use whatever libs or frameworks you'd like through `package.json`.
const models = require('./models')

app.use(express.static('public'))
app.use(require('body-parser').urlencoded({ extended: false }))

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/views/index.html')
})

app.post('/team', async function(req, res, next) {
  try {
    const args = req.body.text.split(/\s+/).filter(x => x.trim())
    if (args[0] === 'invite') {
      const out = [req.body.user_id]
      req.body.text.replace(/<@(U\w+)/g, (a, x) => out.push(x))
      if (out.length < 3) {
        throw new Error(`Sorry, cannot create team as you need at least 3 members (${out.length} found).`)
        return
      }
      const team = await models.createTeam(out)
      res.json({
        response_type: 'in_channel',
        text: `OK, created team "${team.name}" with ${out.map(x => `<@${x}>`).join(', ')}.`
      })
    }
  } catch (err) {
    axios.post(process.env.REPORTING_SLACK_WEBHOOK_URL, {
      text: [
        `Failed to run command: /team ${req.body.text}`,
        `Triggered by <@${req.body.user_id}>`,
        '',
        '```',
        String(err && err.stack),
        '```',
      ].join('\n')
    })
    res.json({
      response_type: 'ephemeral',
      text: `Failed -- ${err}`
    })
  }
})

const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port)
})
