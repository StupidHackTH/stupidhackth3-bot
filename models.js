const base = require('airtable').base('appGku14IaF3SIUts')
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

const findExistingTeam = (teamRecords, userId) => {
  return teamRecords.find(teamRecord => teamRecord.fields.participants.split(',').includes(userId))
}

const formatUsers = userIds => userIds.map(u => `<@${u}>`).join(', ')

exports.addToTeam = async function(requesterId, addeeIds) {
  return await teams.transaction(async table => {
    const teamRecords = await teams.get()
    const existingTeam = findExistingTeam(teamRecords, requesterId)
    if (existingTeam) {
      const existingParticipants = existingTeam.fields.participants.split(',')
      const participants = [...new Set([
        ...existingParticipants,
        ...addeeIds,
      ])]
      const added = participants.filter(p => !existingParticipants.includes(p))
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
      const participants = [...new Set([
        requesterId,
        ...addeeIds
      ])]
      if (participants.length < 3) {
        throw new Error('You need at least 3 unique members to form a team — ' + participants.length + ' found.')
      }
      const createdTeam = await table.create({
        name: `New Team ${number}`,
        participants: participants.join(',')
      })
      return `Created a new team “${createdTeam.fields.name}” with ${formatUsers(participants)}`
    }
  })
}

exports.getTeamInfo = async function(requesterId) {
  const teamRecords = await teams.get()
  const existingTeam = findExistingTeam(teamRecords, requesterId)
  if (!existingTeam) {
    return 'You don’t have a team yet... Use `/stupid add @members...` to create a team.'
  }
  return [
    '
  ]
}