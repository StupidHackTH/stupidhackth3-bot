const base = require('airtable').base('appGku14IaF3SIUts')
const lock = require('throat')(1)

let teams = (() => {
  let cache
  return {
    get() {
      return cache || (cache = base.select.all())
    }
  }
})()

exports.createTeam = async function(members) {
  await lock(async () => {
    
  })
}