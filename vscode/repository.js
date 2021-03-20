

const vscode = require('vscode');
const child_process = require('child_process');



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
					hash: item.slice(1, 7).trim(),
					label: item.slice(8).trim(),
					collapsibleState: null
				};
				if (commit.label.indexOf('.dits') < 0) {
					//コメント
					this.items.push(commit);
				} else {
					//コマンド
					vscode.window.log(commit.label);
					const cargs = commit.label.split(' ');
					switch (cargs[1]) {
						case 'new': //新規子チケット
							this.children.push(commit.id);
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
		vscode.window.showInformationMessage('New Child!');

		//ブランチ再読込
		LoadBranch();
	}



	this.LoadBranch();


};

