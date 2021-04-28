// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const { DitsRepository } = require('./repository');


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	//リポジトリの取得
	// this.repository = new Repository();
	this.repository = new DitsRepository();

	this.SetView = function () {
		//issueにwebViewを設定
		vscode.window.createTreeView('issue', {
			treeDataProvider: new IssueProvider(this.repository)
		});

		//logにViewを設定
		vscode.window.createTreeView('log', {
			treeDataProvider: new LogTreeviewProvider(this.repository)
		});

		//childrenにViewを設定
		vscode.window.createTreeView('children', {
			treeDataProvider: new ChildrenTreeviewProvider(this.repository)
		});

		//closedChildrenにViewを設定
		vscode.window.createTreeView('closedChildren', {
			treeDataProvider: new ClosedChildrenTreeviewProvider(this.repository)
		});
	}

	this.SetView();

	//コマンドの登録
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.refresh', () => {
			this.repository.LoadBranch();
			this.SetView();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.release', () => {
			this.repository.Release();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.newChild', () => {
			this.repository.NewChild();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.openChild', (v) => {
			this.repository.OpenChild(v);
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.finish', () => {
			this.repository.Finish();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.goParent', () => {
			this.repository.GoParent();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.delete', () => {
			this.repository.Delete();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.deleteSub', (v) => {
			this.repository.DeleteSub(v);
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.chdir', (v) => {
			this.repository.Chdir(v);
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.commit', () => {
			this.repository.Commit();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.commitAll', () => {
			this.repository.CommitAll();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.reopen', (v) => {
			this.repository.Reopen(v);
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.revert', (v) => {
			this.repository.Revert(v);
		}));
}

// this method is called when your extension is deactivated
function deactivate() { }

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}



class IssueProvider {
	constructor(r) {
		this.repos = r;
	}
	getTreeItem(v) {
		return v;
	}
	getChildren(v) {
		const issue = this.repos.GetIssueInfo();
		if (!issue) {
			return;
		}
		var t = [];
		//表題
		t.push({
			label: issue.title,
			iconPath: new vscode.ThemeIcon('issue-opened')
		});
		//進捗
		const total = issue.progress.open + issue.progress.closed;
		if (total) {
			const p = total ? 100 * issue.progress.closed / total : 0;
			const proglessLine =
				`    ${p.toFixed(1)}% (`.slice(-8) +
				`    ${issue.progress.closed} /`.slice(-7) +
				`    ${total} )`.slice(-7);
			t.push({
				label: {
					label: proglessLine,
					highlights: [[0, p * proglessLine.length / 100]]
				}
			});
		}
		//所有者
		if (issue.owner) {
			t.push({
				label: `${issue.owner}`,
				iconPath: new vscode.ThemeIcon('account')
			});
		}
		//超課題
		if (issue.super) {
			t.push({
				label: `${issue.super.label}`,
				command: { command: 'dits.goParent' },
				arguments: [ issue.super ],
				iconPath: new vscode.ThemeIcon('fold-up')
			});
		}
		return t;
	}
}

class LogTreeviewProvider {
	constructor(r) {
		this.sub = r.GetLog();
	}
	getTreeItem(c) {
		return {
			label: c.label,
		};
	}
	getChildren() {
		return this.sub;
	}
}

class ChildrenTreeviewProvider {
	constructor(r) {
		this.sub = r.GetSub();
	}
	getTreeItem(c) {
		return {
			label: {
				label: c.title,
				highlights: [[0, !c.IsOpened() ? c.title.length : 0]]
			},
			hash: c.hash,
			command: {
				command: 'dits.openChild',
				arguments: [ c ]
			}
		};
	}
	getChildren() {
		return this.sub;
	}
}
class ClosedChildrenTreeviewProvider {
	constructor(r) {
		this.closed = r.GetClosedSub();
	}
	getTreeItem(c) {
		return {
			label: {
				label: c.title,
				highlights: [[0, !c.revision ? c.title.length : 0]]
			},
			hash: c.hash,
			closedAt: c.closedAt
		};
	}
	getChildren(v) {
		return this.closed;
	}
}

