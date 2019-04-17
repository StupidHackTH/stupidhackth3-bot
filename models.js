const base = require('airtable').base('appGku14IaF3SIUts')
function table(tableName) {
  let cache
  const table = base(tableName)
  return {
    get() {
      if (cache) return cache
      console.log('Fetching airtable table ' + tableName)
      return (cache = table.select().all()).catch(() => { cache = null })
    },
    invalidateCache() {
      cache = null
    },
    async transaction(tx) {
      let noop = false
      try {
        const result = await tx(table, () => { noop = true })
        return result
      } finally {
        if (!noop) cache = null
      }
    }
  }
}

const teams = table('Teams')

const findExistingTeam = (teamRecords, userId) => {
  return teamRecords.find(teamRecord => (teamRecord.fields.participants || '').split(',').includes(userId))
}

const formatUsers = userIds => userIds.map(u => `<@${u}>`).join(', ')

exports.addToTeam = async function(requesterId, addeeIds) {
  return await teams.transaction(async (table, noop) => {
    const teamRecords = await teams.get()
    const existingTeam = findExistingTeam(teamRecords, requesterId)
    const addableIds = addeeIds.filter(id => !findExistingTeam(teamRecords, id))
    const unaddableIds = addeeIds.filter(id => !addableIds.includes(id))
    const btw = unaddableIds.length
      ? ` Didn’t add ${formatUsers(unaddableIds)} because they already belong to a team.`
      : ''
    if (existingTeam) {
      const existingParticipants = existingTeam.fields.participants.split(',')
      const participants = [...new Set([
        ...existingParticipants,
        ...addableIds,
      ])]
      const added = participants.filter(p => !existingParticipants.includes(p))
      if (added.length > 0) {
        await table.update(existingTeam.id, {
          participants: participants.join(',')
        })
        return `Added ${formatUsers(added)} to team “${existingTeam.fields.name}”.${btw}`
      } else {
        noop()
        return `Didn’t add anyone new to team “${existingTeam.fields.name}”.${btw}`
      }
    } else {
      const number = teamRecords.length + 1
      const participants = [...new Set([
        requesterId,
        ...addableIds
      ])]
      if (participants.length < 3) {
        throw new Error('You need at least 3 unique members to form a team — ' + participants.length + ' found.' + btw)
      }
      const createdTeam = await table.create({
        name: `New Team ${number}`,
        participants: participants.join(',')
      })
      return `Created a new team “${createdTeam.fields.name}” with ${formatUsers(participants)}${btw}`
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
    'Here’s your team info:',
    '',
    `*Team name:* ${existingTeam.fields.name} _(rename with \`/stupid set name NewName\`)_`,
    `*Members:* ${formatUsers(existingTeam.fields.participants.split(','))}`
  ].join('\n')
}

exports.listAllTeams = async function() {
  const teamRecords = await teams.get()
  return [
    'Here are the current teams:',
    '',
    ...teamRecords.filter(team => team.fields.participants).map(team => {
      return `*${team.fields.name}*: ${formatUsers(team.fields.participants.split(','))}`
    })
  ].join('\n')
}

exports.leaveTeam = async function(requesterId) {
  return await teams.transaction(async (table, noop) => {
    const teamRecords = await teams.get()
    const existingTeam = findExistingTeam(teamRecords, requesterId)
    if (!existingTeam) {
      noop()
      return 'How can you leave your team when you don’t have one?'
    }
    const existingParticipants = existingTeam.fields.participants.split(',')
    const participants = existingParticipants.filter(id => id !== requesterId)
    if (participants.length < 3) {
      await table.update(existingTeam.id, {
        name: existingTeam.fields.name + ' [disbanded]',
        participants: ''
      })
      return `Your team “${existingTeam.fields.name}” has been disbanded because it has less than 3 members. ${formatUsers(participants)} will have to find a new team.`
    } else {
      await table.update(existingTeam.id, {
        participants: participants.join(',')
      })
      return `You have left team “${existingTeam.fields.name}”.`
    }
  })
}