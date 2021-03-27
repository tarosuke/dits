

const vscode = require('vscode');
const child_process = require('child_process');
const { notStrictEqual } = require('assert');



class Branch{
	constructor(log, branch) {
		this.items = [];
		this.children = [];
		this.closed = [];
		this.closedChildren = [];
		this.branches = [];

		//ログをパース
		for (var item of log.split('\n')) {
			item = item.trim();
			if (item.length) {
				//各コミット分
				var commit = {
					hash: item.slice(0, 7).trim(),
					label: item.slice(8).trim(),
					collapsibleState: null
				};

				if (!this.ParseCommitLabel(commit)) {
					break;
				}
			}
		}
		//ブランチ名一覧を取得
		this.ParseBranch(branch);
	}
	ParseBranch = function (b) {
		for (let item of b.split('\n')) {
			item = item.trim().split(' ');
			if (item[0] == '*') {
				if (!this.currentTitle) {
					//カレントタイトルを取得する(仮
					this.currentTitle = item[1].trim();
				}
				this.branches.push(item[1].trim());
			} else {
				this.branches.push(item[0].trim());
			}
		}
	}
	ParseCommitLabel = function(commit) {
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
						if (!this.currentTitle) {
							this.currentTitle = commit.label.slice(11);
						}
						return false;
					case 'parent': //親子ミットの設定
						if (!this.parent) {
							this.parent = cargs[2];
						}
						break;
					case 'title': //チケットのタイトル
						if (!this.currentTitle) {
							this.currentTitle = commit.label.slice(12);
						}
						break;
					default:
						break;
				}
				break;
			case 'Merge': //merge=closd
				this.closed.push(cargs[2].slice(
					cargs[2][1] == '#' ? 2 : 1, -1));
				break;
			default: //コメント
				this.items.push(commit);
				break;
		}
		return true;
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
		return out.output.toString().slice(1, -1);
	}

	//メッセージだけ空コミット
	this.CommitMessage = function (message) {
		this.Do(['commit', '--allow-empty', '-m', message]);
	}

	//ブランチ情報取得
	this.GetBranch = function () {
		return this.branch.items;
	}
	this.GetParent = function () {
		return this.branch.parent;
	}
	this.GetCurrentBranch = function () {
		return this.branch.currentTitle;
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
		const log = this.Do([
			'log',
			'--oneline',
			'--no-decorate',
			'--first-parent']);
		if (!log) {
			return; //failed
		}
		const branch = this.Do(['branch']);
		if (!branch) {
			return;
		}
		this.branch = new Branch(log, branch);
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
		const command = this.branch.branches.indexOf('#' + ticket.hash) < 0 ?
			['checkout', '-b', '#' + ticket.hash] :
			['checkout', '#' + ticket.hash];

		if (this.Do(command)) {
			this.CommitMessage('.dits open ' + ticket.label);
			this.CommitMessage('.dits parent ' + this.branch.currentTitle);
			vscode.commands.executeCommand('dits.refresh');
		}
	}


	//最初の状態を読み込む
	this.LoadBranch();


};

