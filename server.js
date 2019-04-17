// server.js
// where your node app starts

// init project
const express = require('express')
const app = express()
const axios = require('axios')
const admin = require('./firebase-admin')
const models = require('./models')

app.use(express.static('public'))
app.use(require('body-parser').urlencoded({ extended: false }))

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/views/index.html')
})

async function postRequest(requesterId, responseUrl, description, type, payload) {
  const ref = await admin.database().ref('bot/requests').push({
    description,
    type,
    payload,
    status: 'pending',
    createdAt: admin.database.ServerValue.TIMESTAMP,
    requesterId,
    responseUrl
  })
  return {
    response_type: 'in_channel',
    text: `<@${requesterId}> Received request \`${ref.key}\` to ${description}.`
  }
}

async function stupidBot(requesterId, responseUrl, text) {
  const args = text.split(/\s+/).filter(x => x.trim())
  const post = (description, type, payload) => postRequest(requesterId, responseUrl, description, type, payload)
  if (args[0] === 'add') {
    const out = []
    text.replace(/<@(U\w+)/g, (a, x) => out.push(x))
    if (out.length < 1) {
      throw new Error(`Please tag the users you would like to add to your team.`)
    }
    return post(
      `add ${out.map(x => `<@${x}>`)} to team`,
      'AddToTeam',
      { addeeIds: out }
    )
  } else if (args[0] === undefined || args[0] === 'info') {
    return {
      text: await models.getTeamInfo(requesterId)
    }
  } else if (args[0] === 'retry') {
    const key = args[1]
    const ref = admin.database().ref('bot/requests').child(key)
    const item = await ref.once('value')
    if (!item.exists()) {
      throw new Error('Request does not exist')
    }
    if (!item.child('status').val() === 'pending') {
      throw new Error('Request is already pending')
    }
    await ref.child('status').set('pending')
  } else {
    throw new Error('Unrecognized command...')
  }
}

app.post('/stupid', async function(req, res, next) {
  try {
    const result = await stupidBot(req.body.user_id, req.body.response_url, req.body.text)
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

require('./queue-processor').start()