// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const child_process = require('child_process');
const { chdir, stdout } = require('process');
const uuid = require('uuid');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "helloworld-minimal-sample" is now active!');

	vscode.window.showInformationMessage('Hello World!');


	//gitの起動と出力の回収
//	const proc = child_process.spawn('git', ['commit', '-a', '-m', 'gitを動かせたので'], chdir('dits'));
	// const proc = child_process.spawn('git', ['status']);
	// console.log("child:" + proc.pid);
	// proc.stdout.on('data', (data) => {
	// 	console.log(data.toString());
	// });
	// proc.stderr.on('data', (data) => {
	// 	console.error(data.toString());
	// });


	vscode.window.createTreeView('log', {
		treeDataProvider: new LogTreeviewProvider(vscode.workspace.rootPath)
	});

}

// this method is called when your extension is deactivated
function deactivate() { }

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}



class LogTreeviewProvider {
	constructor(v) {
	}
	getTreeItem(v) {
		return {
			label: v,
			collapsibleState: v.collapsibleState, //ブランチノードのときは設定する
		};
	}
	getChildren(v) {
		var items = [];
		var out = child_process.spawnSync(
			'git',
			['log', '--oneline', '--no-decorate'],
			{ cwd:'dits' } );
		if (!out.status) {
			for (var item of out.output.toString().split('\n')) {
				items.push({ label: item.slice(8) });
			}
		}else{
			vscode.window.showErrorMessage(out.stderr.toString());
		}
		return items;
	}

	// onDidChangeTreeData
}

class Data extends vscode.TreeItem {
	constructor(collapsibleState) {
		super(label, collapsibleState);
	}
}
