var admin = require("firebase-admin")
var serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stupidhackth3.firebaseio.com"
})

module.exports = admin