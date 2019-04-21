const base = require('airtable').base('appGku14IaF3SIUts')
const axios = require('axios')

function table(tableName) {
  let cache
  const table = base(tableName)
  return {
    get() {
      if (cache) return cache
      console.log('[airable] Fetching table ' + tableName)
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
const slackUsers = table('Slack users')
const attendees = table('Attendees')

const findExistingTeam = (teamRecords, userId) => {
  return teamRecords.find(teamRecord => (teamRecord.fields.participants || '').split(',').includes(userId))
}

const formatUsers = userIds => userIds.map(u => `<@${u}>`).join(', ')

const calculateTeamUsers = async function(participants) {
  const existingUsers = await slackUsers.get()
  return existingUsers.filter(record => participants.includes(record.fields.id)).map(record => record.id)
}

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
          participants: participants.join(','),
          users: await calculateTeamUsers(participants),
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
        participants: participants.join(','),
        users: await calculateTeamUsers(participants),
      })
      return [
        `Created a new team “${createdTeam.fields.name}” with ${formatUsers(participants)}${btw}`,
        `To change your team name, run \`/stupid set name New Team Name\``
      ].join('\n')
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
    `*Team name:* ${existingTeam.fields.name} _(rename with \`/stupid set name New Team Name\`)_`,
    `*Members:* ${formatUsers(existingTeam.fields.participants.split(','))}`,
    `*URL:* ${existingTeam.fields.url || ''} _(update with \`/stupid set url ...\`)_`,
    `*Live:* ${existingTeam.fields.private ? 'no' : 'yes'}`,
    ``,
    `*Description:* ${existingTeam.fields.description || '_No description given_'} _(update with \`/stupid set description ...\`)_`,
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
      throw new Error('How can you leave your team when you don’t have one?')
    }
    const existingParticipants = existingTeam.fields.participants.split(',')
    const participants = existingParticipants.filter(id => id !== requesterId)
    if (participants.length < 3) {
      await table.update(existingTeam.id, {
        name: existingTeam.fields.name + ' [disbanded]',
        participants: '',
        users: []
      })
      return `Your team “${existingTeam.fields.name}” has been disbanded because it has less than 3 members. ${formatUsers(participants)} will have to find a new team.`
    } else {
      await table.update(existingTeam.id, {
        participants: participants.join(','),
        users: await calculateTeamUsers(participants),
      })
      return `You have left team “${existingTeam.fields.name}”.`
    }
  })
}

exports.setTeamAttribute = async function(requesterId, key, value) {
  return await teams.transaction(async (table, noop) => {
    const teamRecords = await teams.get()
    const existingTeam = findExistingTeam(teamRecords, requesterId)
    if (!existingTeam) {
      noop()
      throw new Error('You are not currently in a team...')
    }
    if (key === 'name') {
      const name = value.trim()
      const normalize = x => x.replace(/\S/g, '').toLowerCase()
      const anotherExistingTeamWithSameName = teamRecords.find(t => normalize(name) === normalize(t.fields.name))
      if (
        anotherExistingTeamWithSameName &&
        (
          anotherExistingTeamWithSameName.id !== existingTeam.id ||
          name === existingTeam.fields.name
        )
      ) {
        throw new Error('Cannot rename — another team with same or similar name already exists.')
      }
      await table.update(existingTeam.id, { name })
      return `Updated \`${key}\`!`
    }
    if (/^desc/.test(key)) {
      await table.update(existingTeam.id, { description: value })
      return `Updated \`${key}\`!`
    }
    if (key === 'url') {
      await table.update(existingTeam.id, { url: value })
      return `Updated \`${key}\`!`
    }
    if (key === 'live') {
      if (value !== 'no' && value !== 'yes') {
        throw new Error('Please set to "no" or "yes" only.')
      }
      await table.update(existingTeam.id, { private: value === 'no' })
      return `Updated \`${key}\`!`
    }
    noop()
    throw new Error('Property `' + key + '` is not editable...')
  })
}

exports.fsck = async function() {
  const out = []
  const log = text => {
    const line = `[${new Date().toJSON()}] ${text}`
    console.log('[models.fsck]', line)
    out.push(line)
  }
  log('*Performing fsck operation*')

  const userList = (await axios.get('https://slack.com/api/users.list?limit=200', {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_TOKEN}`
    }
  })).data.members.filter(user => user.profile.email)
  log(`Found ${userList.length} users in Slack.`)

  const existingAttendees = await attendees.get()

  await slackUsers.transaction(async (table, noop) => {
    const existingUsers = await slackUsers.get()
    log(`Found ${existingUsers.length} users in Airtable.`)

    for (const user of userList) {
      const existingUserRecord = existingUsers.find(record => record.fields.id === user.id)
      if (!existingUserRecord) {
        log(`Add user <@${user.id}>`)
        await table.create({
          name: user.name,
          email: user.profile.email,
          id: user.id,
          real_name: user.profile.real_name,
          display_name: user.profile.display_name,
          attendee: existingAttendees.filter(record => record.fields.Email === user.profile.email).map(record => record.id)
        })
      }
    }
  })
//   await teams.transaction(async (table, noop) => {
//     const teamRecords = await teams.get()
//   })
  return out.join('\n')
}