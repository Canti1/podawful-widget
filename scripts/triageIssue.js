// First look at a new goon suggestion/report (spam guard). Runs when an issue
// is opened, or edited while labelled needs-fix. It never changes goons.json;
// approval still happens via the "approved" label (see goonIssue.js).
//
// CLI: node scripts/triageIssue.js <event.json> <goons.json> <recentCount> <accountCreatedAt> <outDir>
// Prints close=/add=/remove= lines for $GITHUB_OUTPUT and writes <outDir>/comment.md.

const fs = require('node:fs');
const path = require('node:path');
const { applyIssue } = require('./goonIssue');

const MAX_PER_DAY = 3;
const NEW_ACCOUNT_DAYS = 7;

function triage({ issue, goonsJson, recentCount, accountAgeDays, isOwner }) {
  const out = { close: '', add: [], remove: [], comment: '' };
  const notes = [];

  if (!isOwner && recentCount > MAX_PER_DAY) {
    out.close = 'not planned';
    out.add.push('possible-spam');
    out.comment = `🛑 Closed automatically: more than ${MAX_PER_DAY} goon suggestions/reports from one account in 24 hours. If this was a mistake, the maintainer can reopen it.`;
    return out;
  }
  if (!isOwner && accountAgeDays !== null && accountAgeDays < NEW_ACCOUNT_DAYS) {
    out.add.push('new-account');
    notes.push(`ℹ️ This GitHub account is under ${NEW_ACCOUNT_DAYS} days old, so the maintainer may look a bit closer.`);
  }

  const copy = JSON.parse(JSON.stringify(goonsJson));
  try {
    const r = applyIssue(copy, issue);
    if (!r.changed) {
      out.close = 'completed';
      out.comment = `✅ ${r.summary} Closing since there's nothing to change.`;
    } else {
      out.add.push('ready-for-review');
      out.remove.push('needs-fix');
      out.comment = `👍 Looks valid. If approved: ${r.summary}\n\nWaiting for the maintainer to approve.`;
    }
  } catch (e) {
    if (e.code === 'duplicate') {
      out.close = 'not planned';
      out.comment = `♻️ ${e.message}`;
    } else {
      out.add.push('needs-fix');
      out.remove.push('ready-for-review');
      out.comment = `✏️ Can't use this yet: ${e.message}\n\nEdit the issue to fix it and it'll be checked again.`;
    }
  }
  if (notes.length) out.comment += `\n\n${notes.join('\n')}`;
  return out;
}

function main([eventPath, goonsPath, recent, createdAt, outDir]) {
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const created = Date.parse(createdAt);
  const r = triage({
    issue: event.issue,
    goonsJson: JSON.parse(fs.readFileSync(goonsPath, 'utf8')),
    recentCount: Number(recent) || 0,
    accountAgeDays: Number.isNaN(created) ? null : (Date.now() - created) / 86400000,
    isOwner: event.issue.user.login === event.repository.owner.login,
  });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'comment.md'), r.comment + '\n');
  console.log(`close=${r.close}`);
  console.log(`add=${r.add.join(',')}`);
  console.log(`remove=${r.remove.join(',')}`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { triage, MAX_PER_DAY };
