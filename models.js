const base = require('airtable').base('appGku14IaF3SIUts')
const throat = require('throat')

let teams = (() => {
  let cache
  const lock = throat(1)
  const table = base('Teams')
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
})()

exports.createTeam = async function(participantIds) {
  return await teams.transaction(async (table) => {
    const rows = await teams.get() + 1
    const data = {
      name: `New Team ${rows.length}`,
      participants: participantIds.join(',')
    }
    await table.create(data)
    return {
      newTeam: {
        name: data.name,
        participantIds: participantIds
      }
    }
  })
}