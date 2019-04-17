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

async function teamBot(text, userId) {
  const args = text.split(/\s+/).filter(x => x.trim())
  if (args[0] === 'add') {
    const out = [userId]
    text.replace(/<@(U\w+)/g, (a, x) => out.push(x))
    if (out.length < 3) {
      throw new Error(`Sorry, cannot create team as you need at least 3 members (${out.length} found).`)
    }
    const result = await models.createTeam(out)
    if (result.newTeam) {
      const team = result.newTeam
      return {
        response_type: 'in_channel',
        text: `Created team "${team.name}" with ${team.participantIds.map(x => `<@${x}>`).join(', ')}.`
      }
    } else {
      const team = result.existingTeam
      return {
        response_type: 'in_channel',
        text: `Added ${result.addedParticipantIds.map(x => `<@${x}>`).join(', ')} to team "${team.name}".`
      }
    }
  } else if (args[0] === undefined || args[0] === 'info') {
    return {
      text: 'Meow'
    }
  } else {
    throw new Error('Unrecognized command...')
  }
}

app.post('/team', async function(req, res, next) {
  try {
    const result = await teamBot(req.body.text, req.body.user_id)
    res.json(result)
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
