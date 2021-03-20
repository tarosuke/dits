// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const child_process = require('child_process');
const { chdir, stdout } = require('process');

const { Repository } = require('./repository.js');



// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "helloworld-minimal-sample" is now active!');

	// this.currentPath = vscode.workspace.workspaceFolders;
	this.currentPath = 'dits';

	//リポジトリの取得
	this.repository = new Repository(currentPath);

	//logにViewを設定
	vscode.window.createTreeView('log', {
		treeDataProvider: new LogTreeviewProvider(this.repository)
	});

	//childrenにViewを設定
	vscode.window.createTreeView('children', {
		treeDataProvider: new ChildrenTreeviewProvider(this.repository)
	});

	//コマンドの登録
	context.subscriptions.push(
		vscode.commands.registerCommand('dits.newChild', () => {
			this.repository.NewChild();
	}));
}

// this method is called when your extension is deactivated
function deactivate() { }

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
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

	// onDidChangeTreeData
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

	// onDidChangeTreeData
}
