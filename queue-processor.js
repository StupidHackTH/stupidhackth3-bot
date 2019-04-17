const admin = require('./firebase-admin')
const query = admin.database().ref('bot/requests').orderByChild('status').equalTo('pending')
const base = require('airtable').base('appGku14IaF3SIUts')
const throat = require('throat')
const axios = require('axios')

function table(tableName) {
  let cache
  const lock = throat(1)
  const table = base(tableName)
  return {
    get() {
      return cache || (cache = table.select().all()).catch(() => { cache = null })
    },
    invalidateCache() {
      cache = null
    },
    transaction(tx) {
      return lock(async () => {
        let result
        try {
          result = await tx(table)
          return result
        } finally {
          if (result !== false) cache = null
        }
      })
    }
  }
}

query.on('value', () => {
  // Just for the subscription...
})

async function processRequest(request, key) {
  if (request.type === 'AddToTeam') {
    
  }
  throw new Error('Unimplemented')
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
          text: `<@${request.requesterId}> Request \`${key}\` completed — ${result}`,
        })
      } catch (error) {
        console.error(error)
        await admin.database().ref('bot/requests').child(key).update({
          status: 'failed',
          error: String(error && error.stack)
        })
        await axios.post(request.responseUrl, {
          response_type: 'in_channel',
          text: `<@${request.requesterId}> Failed to process request \`${key}\` — ${error}`,
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
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}