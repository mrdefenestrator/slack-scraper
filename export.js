/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
const childProcess = require('child_process');
const rp = require('request-promise-native');
const path = require('path');
const fs = require('fs');
const program = require('commander');

const EXPORT_PATH = 'dm/';
const MEMBERS_PATH = 'members.json';

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

/**
 * Gets the members from slack and caches in a file locally
 */
async function getMembers(token, outputPath) {
  const membersPath = path.join(outputPath, MEMBERS_PATH);

  let result;
  try {
    result = fs.readFileSync(membersPath);
  } catch (err) {
    result = await rp.get('https://slack.com/api/users.list', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    fs.writeFileSync(membersPath, result);
  }
  const data = JSON.parse(result);
  return data.members;
}

/**
 * Download the DM history for the member
 * @param {*} memberName to export history for
 */
function slackDmExport(token, outputPath, memberName) {
  return new Promise((resolve, reject) => {
    const historyPath = path.join(outputPath, EXPORT_PATH, memberName);

    if (fs.existsSync(historyPath)) {
      resolve(false);
      return;
    }

    const process = childProcess.spawn(
      'slack-history-export',
      [
        '--type', 'dm',
        '--username', memberName,
        '--token', token,
        '--filepath', historyPath,
      ],
    );

    process.on('error', (err) => {
      reject(err);
    });

    process.on('exit', () => {
      resolve(true);
    });
  });
}

/**
 * Gets the member's names and downloads the dm history of each
 */
async function exportSlack(token, outputPath) {
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  }

  const dmPath = path.join(outputPath, EXPORT_PATH);
  if (!fs.existsSync(dmPath)) {
    fs.mkdirSync(dmPath);
  }

  const members = await getMembers(token, outputPath);
  const memberNames = members.map(member => member.name);

  for (const memberName of memberNames) {
    console.log(memberName);
    const exported = await slackDmExport(token, outputPath, memberName);
    if (exported) {
      console.log('   exported - waiting 10s to avoid rate limit');
      await sleep(10000);
    } else {
      console.log('   already exported');
    }
  }
}

/**
 * Main program
 */
async function main() {
  program.description(`\
  Downloads all your slack history for one on one conversations (DMs)
  `);
  program.option('--token <value>', 'REQUIRED: Slack legacy API token https://api.slack.com/custom-integrations/legacy-tokens');
  program.option('--path <value>', 'REQUIRED: Path to export data to');
  program.option('--update-non-empty', 'Download history for non-empty conversations');
  program.on('-h, --help', () => {
    console.log(program.help());
    process.exit(-1);
  });
  program.parse(process.argv);

  if (!program.token || !program.path) {
    console.log('Missing required parameter(s)');
    console.log(program.help());
    process.exit(-1);
  }

  await exportSlack(program.token, program.path);
  console.log('Done');
}

main();
