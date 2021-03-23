

const vscode = require('vscode');
const child_process = require('child_process');
const { title } = require('process');



class Branch{
	constructor(out) {
		this.items = [];
		this.children = [];
		const outStr = out.slice(1, -1);
		// console.log(outStr);
		for (var item of outStr.split('\n')) {
			item = item.trim();
			if (item.length) {
				//各コミット分
				const commit = {
					hash: item.slice(0, 7).trim(),
					label: item.slice(8).trim(),
					collapsibleState: null
				};
				if (commit.label.indexOf('.dits') < 0) {
					//コメント
					this.items.push(commit);
				} else {
					//コマンド
					const cargs = commit.label.split(' ');
					switch (cargs[1]) {
						case 'new': //新規子チケット
							this.children.push(commit.label.slice(9));
							break;
						default:
							break;
					}
				}
			}
		}
	}
};




exports.Repository = function (currentPath) {
	this.currentPath = currentPath;

	//Git呼び出し
	this.Do = function (args) {
		var out = child_process.spawnSync(
			'git', args, { cwd: currentPath });
		if (out.status) {
			vscode.window.showErrorMessage(out.stderr.toString());
			return;
		}
		return out.output.toString();
	}

	//メッセージだけ空コミット
	this.CommitMessage = function (message) {
		this.Do(['commit', '--allow-empty', '-m', message]);
	}

	//ブランチ情報取得
	this.GetBranch = function () {
		return this.branch.items;
	}

	//子チケット情報取得
	this.GetChildren = function () {
		return this.branch.children;
	}

	//branchの読み込み
	this.LoadBranch = function () {
		const result = this.Do(['log', '--oneline', '--no-decorate']);
		if (!result) {
			return; //failed
		}
		this.branch = new Branch(result);
	}

	//子チケット追加
	this.NewChild = function () {

		let options = {
			prompt: "Title: ",
			placeHolder: "(title the new issue)"
		}

		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				return;
			}
			value.trim();
			if (!value.length) {
				return;
			}

			this.CommitMessage('.dits new '+value);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}


	//最初の状態を読み込む
	this.LoadBranch();


};

