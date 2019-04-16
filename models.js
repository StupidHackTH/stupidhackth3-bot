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
    async transaction(tx) {
      await lock(async () => {
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

exports.createTeam = async function(members) {
  return await teams.transaction(async (table) => {
    const rows = teams.get()
    const data = {
      name: `New Team ${rows.length}`,
      participants: members.join(',')
    }
    await table.create(data)
    return data
  })
}