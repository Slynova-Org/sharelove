'use strict'

const got = require('got')
const { join } = require('path')
const colors = require('colors')
const emoji = require('node-emoji')
const { dependencies, devDependencies } = require(join(process.cwd(), 'package.json'))

const aliases = {}
const notStarred = {}
const allDependencies = Object.keys({ ...dependencies, ...devDependencies })

if (!process.env.GITHUB_API_TOKEN) {
  console.log(colors.red(`${emoji.get('warning')}  We use GITHUB_API_TOKEN environment variable to call the Github API.`))
  console.log(colors.red(`Please run ${colors.bold('export GITHUB_API_TOKEN="YOUR_TOKEN"')} and try again.`))
  process.exit()
}

async function callGithubApi (query) {
  const { body } = await got.post('https://api.github.com/graphql', {
    body: { query },
    headers: { authorization: `Bearer ${process.env.GITHUB_API_TOKEN}` },
    json: true,
  })

  return body.data
}

async function fetchPackagesInformation () {
  const { body } = await got.post('https://api.npms.io/v2/package/mget', {
    body: allDependencies,
    json: true,
  })

  return Object.entries(body).map(([pkgName, pkgInfo]) => {
    const url = pkgInfo.collected.metadata.repository.url.split('/')
    const owner = url[3]
    const repository = url[4].substring(0, url[4].lastIndexOf('.'))

    return { name: pkgName, owner, repository }
  })
}

async function thanksDependencies () {
  const pkgs = await fetchPackagesInformation()
  let query = ''

  pkgs.forEach(({ name, owner, repository }, index) => {
    query += `_${index}: repository(owner:"${owner}",name:"${repository}"){id,viewerHasStarred}\n`
    aliases[`_${index}`] = { name, owner, repository }
  })

  const repos = await callGithubApi(`query{${query}}`)
  query = ''

  Object.entries(repos).forEach(([alias, repo], index) => {
    if (!repo.viewerHasStarred) {
      query += `_${index}: addStar(input:{clientMutationId:"${alias}",starrableId:"${repo.id}"}){clientMutationId}\n`
      notStarred[alias] = repo
    }
  })

  if (Object.keys(notStarred).length <= 0) {
    console.log(`You already starred all your GitHub dependencies. ${emoji.get('heart')}`)
  } else {
    await callGithubApi(`mutation{${query}}`)

    console.log(`Stars sent to :`)

    Object.entries(notStarred).forEach(([alias, repo]) => {
      console.log(`    - ${emoji.get('star')}  ${colors.blue(aliases[alias].name)}`)
    })

    console.log(`\nThanks to you! ${emoji.get('heart')}`)
  }

  process.exit()
}

thanksDependencies()
