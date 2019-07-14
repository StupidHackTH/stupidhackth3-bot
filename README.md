stupidhackth3-bot
=================

The Slack bot used in Stupid Hackathon 3.
This bot allows participants and organizers who are all in the Slack workspace to register and manage their team.

- Data is mainly stored inside Airtable (source of truth) to allow easy visualization as well as manual edits.

- Due to Airtable's API rate limit and lack of transactions or compare-and-set mechanism, we must be extra careful:

  - Reading the data too often can lead to an API rate limit.
  - Concurrent writes can cause data corruption. e.g. 2 requests adding to an array on the same row can cause data loss,
    because when modifying arrays in Airtable, we have send the new array contents, not the changes to be made (like in DBMS).

  Therefore, we have two types of models, similar to CQRS systems:

  - **Read models:** Reads data from Airtable, with caching of table contents to allow frequent reads.

  - **Write models:** The transaction is first written into Firebase Realtime Database with "pending" state.
    A separate process then reads from the database, and process the requests one-by-one, essentially turning it into an operation queue.
    Once the operation is completed, the read model's cache is invalidated, and the transaction state changes to either "completed" or "failed".
    Here, the operation queue also acts as an audit log, allowing administrator to inspect each transaction:
    When it happened, by whom, and what is the result.

## Operation Queue Data Model

```ts
/** Human-readable description for displaying and auditing purpose */
description: string

/** Operation type. See `queue-processor.js` */
type: string

/** Operation payload */
payload: any

/** Operation status */
status: 'pending' | 'completed' | 'failed'

/** The time this operation is requested. To ensure FIFO processing order. */
createdAt: admin.database.ServerValue.TIMESTAMP

/** Slack user ID of the requester, for auditing */
requesterId: string

/**
 * The `response_url` from the Slash command invocation.
 * So that the bot can reply back to the requester with the result.
 * @see https://api.slack.com/slash-commands
 */
responseUrl: string

/** Result of the operation, for replying back and for audit */
result: string
```

Made by [Glitch](https://glitch.com/)
-------------------

\ ゜o゜)ノ
