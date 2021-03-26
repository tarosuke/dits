

const vscode = require('vscode');
const child_process = require('child_process');



class Branch{
	constructor(out) {
		this.items = [];
		this.children = [];
		this.closed = [];
		this.closedChildren = [];
		const outStr = out.slice(1, -1);
		for (var item of outStr.split('\n')) {
			item = item.trim();
			if (item.length) {
				//各コミット分
				var commit = {
					hash: item.slice(0, 7).trim(),
					label: item.slice(8).trim(),
					collapsibleState: null
				};

				//コミットラベルをパース
				const cargs = commit.label.split(' ');
				switch (cargs[0]) {
					case '.dits':
						//コマンド
						switch (cargs[1]) {
							case 'new': //新規子チケット
								commit.label = commit.label.slice(10);
								if (this.closed.indexOf(commit.hash) < 0) {
									this.children.push(commit);
								} else {
									this.closedChildren.push(commit);
								}
								break;
							case 'open': //ブランチの始まり=解析終了
								return;
							default:
								break;
						}
						break;
					case 'Merge': //merge=closd
						this.closed.push(cargs[2].slice(1, -1));
						break;
					default: //コメント
						this.items.push(commit);
						break;
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
	this.GetClosedChildren = function () {
		return this.branch.closedChildren;
	}

	//branchの読み込み
	this.LoadBranch = function () {
		const result = this.Do([
			'log',
			'--oneline',
			'--no-decorate',
			'--first-parent']);
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

	this.OpenChild = function (ticket) {
		vscode.window.showInformationMessage('open child:' + ticket.label);

		if (this.Do(['checkout', '-b', ticket.hash])) {
			this.CommitMessage('.dits open');
			vscode.commands.executeCommand('dits.refresh');
		}
	}


	//最初の状態を読み込む
	this.LoadBranch();


};

