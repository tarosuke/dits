// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const { Repository } = require('./repository.js');



// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	//リポジトリの取得
	this.repository = new Repository();

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
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Finishing issue',
				cancellable: false
			}, (progress, token) => {
				const p = new Promise((resolve, reject) => {
					progress.report({ increment: 0 });
					this.repository.Finish();
					progress.report({ increment: 100 });
					resolve();
				});
				return p;
			});
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
		const progress = issue.progress * 100;
		if (0 <= progress) {
			t.push({
				label: `(${progress.toFixed(1)}%) ${issue.issue}`
			});
		}
		if (issue.parent) {
			t.push({
				label: 'super: ' + issue.parent,
				command: { command: 'dits.goParent' }
			});
		}
		return t;
	}
}

class LogTreeviewProvider {
	constructor(r) {
		this.branch = r.GetBranch();
	}
	getTreeItem(v) {
		return {
			label: v,
			collapsibleState: v.collapsibleState, //ブランチノードのときは設定する
		};
	}
	getChildren(v) {
		return this.branch;
	}
}

class ChildrenTreeviewProvider {
	constructor(r) {
		this.children = r.GetChildren();
	}
	getTreeItem(v) {
		return {
			label: {
				label: v.label,
				highlights: [[0, v.notOpened ? v.label.length : 0]]
			},
			hash: v.hash,
			command: {
				command: 'dits.openChild',
				arguments: [ v ]
			}
		};
	}
	getChildren(v) {
		return this.children;
	}
}
class ClosedChildrenTreeviewProvider {
	constructor(r) {
		this.closedChildren = r.GetClosedChildren();
	}
	getTreeItem(v) {
		return {
			label: v,
		};
	}
	getChildren(v) {
		return this.closedChildren;
	}
}

