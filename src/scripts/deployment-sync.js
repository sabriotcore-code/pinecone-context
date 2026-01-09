#!/usr/bin/env node
/**
 * Deployment Sync Script - Auto-update Pinecone and CLAUDE.md on deployment
 *
 * Usage:
 *   npm run deploy-sync -- --repo cloud-orchestrator --commit abc123 --message "feat: Add feature"
 *   npm run deploy-sync -- --repo cloud-orchestrator --auto  (fetches from git)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { storeContext } from '../context.js';
import { validateConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_MD_PATH = process.env.CLAUDE_MD_PATH || path.join(process.env.HOME || process.env.USERPROFILE, 'claude-config', 'CLAUDE.md');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result[key] = value;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

/**
 * Get git info from the current directory or specified repo
 */
function getGitInfo(repoPath = '.') {
  try {
    const cwd = path.resolve(repoPath);
    const commit = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
    const fullCommit = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
    const message = execSync('git log -1 --pretty=%B', { cwd, encoding: 'utf-8' }).trim();
    const author = execSync('git log -1 --pretty=%an', { cwd, encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    const timestamp = execSync('git log -1 --pretty=%ci', { cwd, encoding: 'utf-8' }).trim();
    const repoName = execSync('git remote get-url origin', { cwd, encoding: 'utf-8' })
      .trim()
      .split('/')
      .pop()
      ?.replace('.git', '') || 'unknown';

    // Get changed files
    const changedFiles = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { cwd, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(f => f.length > 0);

    // Get diff stats
    const diffStats = execSync('git diff-tree --no-commit-id --stat -r HEAD', { cwd, encoding: 'utf-8' }).trim();

    return {
      commit,
      fullCommit,
      message,
      author,
      branch,
      timestamp,
      repoName,
      changedFiles,
      diffStats,
    };
  } catch (error) {
    console.error('Failed to get git info:', error.message);
    return null;
  }
}

/**
 * Analyze commit message to determine deployment type
 */
function analyzeCommit(message) {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.startsWith('feat:') || lowerMsg.includes('add ') || lowerMsg.includes('implement')) {
    return { type: 'feature', priority: 'high' };
  }
  if (lowerMsg.startsWith('fix:') || lowerMsg.includes('bug') || lowerMsg.includes('patch')) {
    return { type: 'bugfix', priority: 'high' };
  }
  if (lowerMsg.startsWith('perf:') || lowerMsg.includes('performance') || lowerMsg.includes('optimize')) {
    return { type: 'performance', priority: 'medium' };
  }
  if (lowerMsg.startsWith('refactor:') || lowerMsg.includes('refactor')) {
    return { type: 'refactor', priority: 'low' };
  }
  if (lowerMsg.startsWith('docs:') || lowerMsg.includes('documentation')) {
    return { type: 'documentation', priority: 'low' };
  }
  if (lowerMsg.startsWith('chore:') || lowerMsg.includes('deps') || lowerMsg.includes('dependencies')) {
    return { type: 'maintenance', priority: 'low' };
  }

  return { type: 'general', priority: 'medium' };
}

/**
 * Generate context text for Pinecone storage
 */
function generateDeploymentContext(gitInfo, status = 'success') {
  const analysis = analyzeCommit(gitInfo.message);
  const date = new Date().toISOString().split('T')[0];

  const keyChanges = gitInfo.changedFiles
    .filter(f => !f.includes('node_modules') && !f.includes('.lock'))
    .slice(0, 10)
    .map(f => `- ${f}`)
    .join('\n');

  return `DEPLOYMENT: ${gitInfo.repoName} - ${date}

COMMIT: ${gitInfo.commit} (${gitInfo.branch})
TYPE: ${analysis.type}
PRIORITY: ${analysis.priority}
STATUS: ${status}

MESSAGE:
${gitInfo.message}

KEY FILES CHANGED:
${keyChanges || '- No significant file changes'}

STATS:
${gitInfo.diffStats}

This deployment ${status === 'success' ? 'completed successfully' : 'had issues'} on ${date}.`;
}

/**
 * Update CLAUDE.md with deployment info (optional)
 */
function updateClaudeMd(gitInfo, options = {}) {
  const { updateClaudeMd = true } = options;

  if (!updateClaudeMd) return false;

  try {
    if (!fs.existsSync(CLAUDE_MD_PATH)) {
      console.log('CLAUDE.md not found at:', CLAUDE_MD_PATH);
      return false;
    }

    let content = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');

    // Update the "Last Updated" date
    const today = new Date().toISOString().split('T')[0];
    content = content.replace(
      />\s*\*\*Last Updated:\*\*\s*\d{4}-\d{2}-\d{2}/,
      `> **Last Updated:** ${today}`
    );

    fs.writeFileSync(CLAUDE_MD_PATH, content);
    console.log(`Updated CLAUDE.md date to ${today}`);
    return true;
  } catch (error) {
    console.error('Failed to update CLAUDE.md:', error.message);
    return false;
  }
}

/**
 * Store deployment in Pinecone
 */
async function storeDeployment(gitInfo, status = 'success') {
  const analysis = analyzeCommit(gitInfo.message);
  const contextText = generateDeploymentContext(gitInfo, status);

  const metadata = {
    type: 'deployment',
    repo: gitInfo.repoName,
    commit: gitInfo.commit,
    fullCommit: gitInfo.fullCommit,
    branch: gitInfo.branch,
    author: gitInfo.author,
    deploymentType: analysis.type,
    priority: analysis.priority,
    status,
    changedFilesCount: gitInfo.changedFiles.length,
    keyFiles: gitInfo.changedFiles.slice(0, 5).join(', '),
    project: 'rei-system',
  };

  const ids = await storeContext(contextText, metadata);
  return ids;
}

/**
 * Also store as a decision if it's a significant change
 */
async function storeAsDecision(gitInfo) {
  const analysis = analyzeCommit(gitInfo.message);

  // Only store significant changes as decisions
  if (analysis.priority !== 'high' && gitInfo.changedFiles.length < 3) {
    return null;
  }

  const decisionText = `${gitInfo.repoName.toUpperCase()} UPDATE - ${new Date().toISOString().split('T')[0]}

COMMIT: ${gitInfo.commit}

${gitInfo.message}

Files changed: ${gitInfo.changedFiles.length}
Key changes: ${gitInfo.changedFiles.slice(0, 5).join(', ')}

This change was deployed to production.`;

  const metadata = {
    type: 'decision',
    title: `${gitInfo.repoName} Deployed`,
    repo: gitInfo.repoName,
    commit: gitInfo.commit,
    project: 'rei-system',
  };

  const ids = await storeContext(decisionText, metadata);
  return ids;
}

async function main() {
  console.log('=== Deployment Sync ===\n');

  validateConfig();

  const args = parseArgs();

  // Get git info
  let gitInfo;

  if (args.auto) {
    // Auto-detect from current repo or specified path
    const repoPath = args.path || '.';
    gitInfo = getGitInfo(repoPath);
    if (!gitInfo) {
      console.error('Failed to get git info. Make sure you are in a git repository.');
      process.exit(1);
    }
  } else if (args.repo && args.commit && args.message) {
    // Manual specification
    gitInfo = {
      commit: args.commit.slice(0, 7),
      fullCommit: args.commit,
      message: args.message,
      author: args.author || 'Unknown',
      branch: args.branch || 'master',
      timestamp: new Date().toISOString(),
      repoName: args.repo,
      changedFiles: args.files ? args.files.split(',') : [],
      diffStats: args.stats || '',
    };
  } else {
    console.log('Usage:');
    console.log('  npm run deploy-sync -- --auto [--path /path/to/repo]');
    console.log('  npm run deploy-sync -- --repo <name> --commit <hash> --message "commit message"');
    console.log('\nOptions:');
    console.log('  --auto              Auto-detect from git repository');
    console.log('  --path <path>       Path to git repository (with --auto)');
    console.log('  --repo <name>       Repository name');
    console.log('  --commit <hash>     Commit hash');
    console.log('  --message <msg>     Commit message');
    console.log('  --status <status>   Deployment status (success/failed)');
    console.log('  --no-claude-md      Skip CLAUDE.md update');
    process.exit(1);
  }

  const status = args.status || 'success';

  console.log(`Repository: ${gitInfo.repoName}`);
  console.log(`Commit: ${gitInfo.commit}`);
  console.log(`Branch: ${gitInfo.branch}`);
  console.log(`Message: ${gitInfo.message.split('\n')[0]}`);
  console.log(`Status: ${status}`);
  console.log(`Files changed: ${gitInfo.changedFiles.length}`);
  console.log('');

  // Store in Pinecone
  console.log('Storing deployment in Pinecone...');
  const deploymentIds = await storeDeployment(gitInfo, status);
  console.log(`Created ${deploymentIds.length} deployment vector(s)`);

  // Store as decision if significant
  const decisionIds = await storeAsDecision(gitInfo);
  if (decisionIds) {
    console.log(`Created ${decisionIds.length} decision vector(s)`);
  }

  // Update CLAUDE.md
  if (!args['no-claude-md']) {
    updateClaudeMd(gitInfo);
  }

  console.log('\n=== Sync Complete ===');

  return {
    repo: gitInfo.repoName,
    commit: gitInfo.commit,
    vectorsCreated: deploymentIds.length + (decisionIds?.length || 0),
  };
}

// Export for use as module
export { storeDeployment, storeAsDecision, getGitInfo, generateDeploymentContext };

// Run if called directly
main().catch(console.error);
