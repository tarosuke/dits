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
	// this.currentPath = vscode.workspace.workspaceFolders;
	this.currentPath = 'dits';

	//リポジトリの取得
	this.repository = new Repository(currentPath);

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
		vscode.commands.registerCommand('dits.newChild', () => {
			this.repository.NewChild();
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.openChild', (v) => {
			this.repository.OpenChild(v);
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
		return [
			{ label: 'title: ' },
			{ label: 'parent: ' + this.repos.GetParent() }
		];
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
			label: v,
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

