const admin = require('./firebase-admin')
const query = admin.database().ref('bot/requests').orderByChild('status').equalTo('pending')
const base = require('airtable').base('appGku14IaF3SIUts')
const axios = require('axios')

function table(tableName) {
  let cache
  const table = base(tableName)
  return {
    get() {
      return cache || (cache = table.select().all()).catch(() => { cache = null })
    },
    invalidateCache() {
      cache = null
    },
    async transaction(tx) {
      let result
      try {
        result = await tx(table)
        return result
      } finally {
        if (result !== false) cache = null
      }
    }
  }
}

const teams = table('Teams')

query.on('value', () => {
  // Just for the subscription...
})

const findExistingTeam = (teamRecords, userId) => {
  return teamRecords.find(teamRecord => teamRecord.fields.participants.split(',').includes(userId))
}

const formatUsers = userIds => userIds.map(u => `<@${u}>`).join(', ')

async function processRequest(request, key) {
  if (request.type === 'AddToTeam') {
    return await teams.transaction(async table => {
      const teamRecords = await teams.get()
      const existingTeam = findExistingTeam(teamRecords, request)
      if (existingTeam) {
        const existingParticipants = existingTeam.fields.participants.split(',')
        const participants = [
          ...new Set([
            ...existingParticipants,
            ...request.payload.addeeIds,
          ])
        ]
        const added = participants.filter(p => !existingParticipants.include(','))
        if (added.length > 0) {
          await table.update(existingTeam.id, {
            participants: participants.join(',')
          })
          return `Added ${formatUsers(added)} to team “${existingTeam.fields.name}”`
        } else {
          return `Didn’t add anyone new to team “${existingTeam.fields.name}”`
        }
      } else {
        const number = teamRecords.length + 1
        // const data = {
        //   name: `New Team ${rows.length}`,
        //   participants: participantIds.join(',')
        // }
        // await table.create(data)
        // return {
        //   newTeam: {
        //     name: data.name,
        //     participantIds: participantIds
        //   }
        // }
      }
    })
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