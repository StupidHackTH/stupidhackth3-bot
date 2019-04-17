const admin = require('./firebase-admin')
const models = require('./models')
const query = admin.database().ref('bot/requests').orderByChild('status').equalTo('pending')
const axios = require('axios')

query.on('value', () => {
  // Just for the subscription...
})

async function processRequest(request, key) {
  if (request.type === 'AddToTeam') {
    return await models.addToTeam(request.requesterId, request.payload.addeeIds)
  }
  if (request.type === 'LeaveTeam') {
    return await models.leaveTeam(request.requesterId)
  }
  if (request.type === 'SetTeamAttribute') {
    return await models.setTeamAttribute(request.requesterId, request.payload.key, request.payload.value)
  }
  throw new Error('Unimplemented request handler for type ' + request.type)
}

exports.start = async () => {
  for (;;) {
    const pending = (await query.once('value')).val() || {}
    let context = 'loop'
    try {
      const pendingCount = Object.keys(pending).length
      if (Object.keys(pending).length === 0) {
        continue
      }
      const key = Object.keys(pending)[0]
      const request = pending[key]
      context = `request ${key}` + [
        '',
        '```',
        require('util').inspect(request, { depth: 10 }),
        '```',
      ].join('\n')
      console.log(`Found ${pendingCount} pending requests -- will process ${key}`)
      try {
        const result = await processRequest(request, key)
        await admin.database().ref('bot/requests').child(key).update({
          status: 'completed',
          result: result || null
        })
        await axios.post(request.responseUrl, {
          response_type: 'in_channel',
          text: `<@${request.requesterId}> :white_check_mark: Request \`${key}\` completed — ${result}`,
        })
      } catch (error) {
        console.error(error)
        await admin.database().ref('bot/requests').child(key).update({
          status: 'failed',
          error: String(error && error.stack)
        })
        await axios.post(request.responseUrl, {
          response_type: 'in_channel',
          text: `<@${request.requesterId}> :x: Request \`${key}\` failed — ${error}`,
        })
      }
    } catch (error) {
      console.error(error)
      axios.post(process.env.REPORTING_SLACK_WEBHOOK_URL, {
        text: [
          `Failed to process ${context}`,
          '',
          '```',
          String(error && error.stack),
          '```',
        ].join('\n')
      })
    } finally {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}