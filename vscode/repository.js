

const vscode = require('vscode');
const child_process = require('child_process');
const fs = require("fs");
const { prependOnceListener } = require('process');


//後方互換性設定
var backwordCompatible = false;
var updateFrom = 'master'


//ハッシュ／ブランチ比較
function IsSame(aa, bb) {
	const a = aa.replace(/^#/, '');
	const b = bb.replace(/^#/, '');
	return backwordCompatible ?
		a.length < b.length ? !b.indexOf(a) : !a.indexOf(b) :
		a === b;
};


//コミット
class Commit{
	hash;
	supers;
	owner;
	message;

	constructor(hash, message = null) {
		this.hash = hash.replace(/^#/, '');
		this.supers = [];
		this.message = message;
	};
	AddSuper(s) {
		this.supers.push(s);
	};
	SetOwner(o) {
		this.owner = o;
	};
	AddMessage(m) {
		if (this.message) {
			this.message += '\n' + m;
		} else {
			this.message = m.trim();
		}
	}
};

//コミットのリスト
class Commits {
	#list;
	constructor() {
		this.#list = [];
	}
	GetList() {
		return this.#list;
	}
	Add(commit) {
		this.#list.push(commit);
	}
	ForEach(f) {
		this.#list.find(f);
	}
	GetLength() {
		return this.#list.length;
	}
	Find(hash) {
		return this.#list.find(e => IsSame(hash, e.hash));
	}
};

//ブランチ情報
class BranchInfo {
	current;
	list = [];
	Add(name) {
		this.list.push(name);
	}
	AddCurrent(name) {
		this.list.push(name);
		this.current = name;
	}
	IsIn(name) {
		return name ? this.list.find(e => IsSame(name, e)) : nell;
	}
};

//Gitアクセス
class Git {
	#path;
	#isRemote;
	#commits = new Commits;
	#branchInfo = new BranchInfo;
	#modifieds = [];
	#staged = [];
	#untrackeds = [];

	//ステータス読み込み
	#LoadStatus() {
		const raw = this.Do(['status', '--short']);
		if (!raw) {
			return; //failed
		}

		for (const item of raw.split('\n')) {
			const filename = item.slice(3);
			if (filename.length) {
				if (item[0] === '?') {
					//未登録ファイル
					this.#untrackeds.push(filename);
				} else {
					if (item[0] != ' ') {
						//STAGED
						this.#staged.push(filename);
					}
					if (item[1] != ' ') {
						//Modified
						this.#modifieds.push(filename);
					}
				}
			}
		}
	}

	//ブランチ情報取得
	#LoadBranchInfo() {
		const b = this.Do(['branch']).trim();;
		if (!b) {
			return; //failed
		}

		for (let item of b.split('\n')) {
			const i = item.trim().split(' ');
			if (i[0] === '*') {
				this.#branchInfo.AddCurrent(i[1].trim());
			} else {
				this.#branchInfo.Add(i[0].trim());
			}
		}
	}

	//ログ読み込み
	#LoadLog() {
		const rawData = this.Do([
			'log',
			'--first-parent',
			'--pretty=raw']);
		if (!rawData) {
			return;
		}

		var commit;
		rawData.split('\n').forEach(line => {
			const token = line.split(' ');
			switch (token[0]) {
				case 'commit':
					if (commit) {
						//commitをcommitsへ追加
						this.#commits.Add(commit);
					}
					commit = new Commit(token[1]);
					break;
				case 'parent':
					commit.AddSuper(token[1]);
					break;
				case 'author':
					commit.SetOwner(line.slice(7, -17));
					break;
				case 'tree':
				case 'committer':
					break;
				default:
					if (line && 4 < line.length) {
						commit.AddMessage(line.slice(4));
					}
					break;
			}
		});
	};

	constructor(workingPath) {
		this.#path = workingPath;

		//リモートの有無を確認
		this.#isRemote = 3 < this.Do(['remote']).length;

		this.#LoadLog();
		this.#LoadBranchInfo();
		this.#LoadStatus();
	}

	//Git呼び出し
	Do(args, supressError = false) {
		if (!this.#path) {
			return;
		}
		var out = child_process.spawnSync(
			'git', args, { cwd: this.#path });
		if (out.status) {
			if (!supressError) {
				vscode.window.showErrorMessage(out.stderr.toString());
			}
			return;
		}
		return out.output.toString().slice(1, -1);
	};
	DoR(args, supressError = false) {
		if (this.#isRemote) {
			return this.Do(args, supressError);
		}
		return "remote operation has be skipped(no remote).";
	}

	//メッセージだけの空コミット
	CommitEmpty(message) {
		return this.Do(['commit', '--allow-empty', '-m', message]);
	};

	//現ブランチのログを取得
	GetLog() {
		return this.#commits;
	};

	//ブランチ情報取得
	GetBranchInfo() {
		return this.#branchInfo;
	}

	//フルコミット情報取得
	FindCommit(hash) {
		return hash ? this.#commits.Find(hash) : null;
	}

	//未登録ファイルリスト取得
	GetUntrackeds() {
		return this.#untrackeds;
	}
	//Stagedファイルリスト取得
	GetStageds() {
		return this.#staged;
	}
	//変更ファイルリスト取得
	GetModifieds() {
		return this.#modifieds;
	}
};



//issue関連
class Entry {
	hash;
	title;
	closedAt;
	#state = 0; //0:new, 1:opened, 2:closed, 3:dereted 4:ignored
	#Set(s) {
		if (this.#state) {
			return;
		}
		this.#state = s;
	};
	constructor(hash) {
		this.hash = hash.replace(/^#/, '');
	}
	New(hash, title) {
		this.title = title;
		this.hash = hash.replace(/^#/, '');
	};
	Open() { this.#Set(1); };
	Close(at, rev) {
		this.#Set(2);
		this.closedAt = at;
		this.revision = rev;
	};
	Delete() { this.#Set(3); };
	MarkIgnore() { if (!this.title) { this.#state = 4; } };
	IsNew() { return !this.#state; }
	IsOpened() { return this.#state == 1; }
	IsClosed() { return this.#state == 2;; }
	IsDeleted() { return this.#state == 3; }
};

class Issue {
	#branchInfo;
	//dits管理外commit
	log = [];
	//現issue
	currentTitle;
	currentBranch;
	lastRevision;
	ownerCommit;
	//状態別issueリスト
	super;

	//副課題リスト
	#sub = [];
	#GetSub(hash) {
		var t = this.#sub.find(i => IsSame(hash, i.hash));
		if (t) {
			return t;
		}
		t = new Entry(hash);
		this.#sub.push(t);
		return t;
	}
	#NewSub(hash, title) {
		var t = this.#GetSub(hash);
		t.New(hash, title);
		if (this.#branchInfo.IsIn(hash)) {
			//対応するブランチがあるならOpenにする
			t.Open();
		}
	};
	#OpenSub(hash) { this.#GetSub(hash).Open(); };
	#CloseSub(hash, closedAt) {
		this.#GetSub(hash).Close(closedAt, this.revision);
	};
	#DeleteSub(hash) { this.#GetSub(hash).Delete(); };
	#IgnoreUnlabeled() {
		this.#sub.forEach(e => e.MarkIgnore());
	}
	GetProgress() {
		var p = { closed: 0, open: 0 };
		this.#sub.forEach(e => {
			if (!e.IsDeleted()) {
				if (e.IsClosed()) {
					p.closed++;
				} else {
					p.open++
				};
			}
		});
		return p;
	}
	GetLivingList() {
		var t = [];
		this.#sub.forEach(e => {
			if (e.IsNew() || e.IsOpened()){
				//追加
				t.push(e);
			}
		});
		return t;
	}
	GetClosedList() {
		var t = [];
		this.#sub.forEach(e => {
			if (e.IsClosed()) {
				//追加
				t.push(e);
			}
		});
		return t;
	}

	//ditsコマンドの解釈
	#Super(c, cargs) {
		const pLabel =
			c.message.slice(
				cargs[0].length +
				cargs[1].length +
				cargs[2].length + 3);
		if (!this.super) {
			this.super = {
				branch: cargs[2],
				label: pLabel ? pLabel : cargs[2]
			}
		}
	}

	#SetOwner(commit) {
		if (!this.ownerCommit) {
			this.ownerCommit = commit.hash;
		}
	}

	constructor(commits, branchInfo) {
		//設定の読み込み
		backwordCompatible =
			vscode.workspace.getConfiguration('dits').get('backwordCompatible');
		updateFrom =
			vscode.workspace.getConfiguration('dits').get('updateFrom');

		this.#branchInfo = branchInfo;
		this.currentBranch = branchInfo.current;
		commits.ForEach(c => {
			//コミットメッセージをパース
			const cargs = c.message.split(' ');
			switch (cargs[0]) {
				case '.dits':
					//ditsコマンド
					switch (cargs[1]) {
						case 'open':
							if (!this.currentTitle) {
								this.currentTitle = c.message.slice(11);
							};
							this.#SetOwner(c);
							return true;
						case 'new': //新規服課題
							this.#NewSub(c.hash, c.message.slice(10));
							break;
						case 'delete': //削除済み副課題
							this.#DeleteSub(cargs[2]);
							break;
						case 'title': //課題タイトル
							if (!this.currentTitle) {
								this.currentTitle = c.message.slice(12);
							}
							break;
						case 'release': //リリース情報
							this.revision = cargs[2];
							if (!this.lastRevision) {
								this.lastRevision = this.revision;
							}
							break;
						case 'parent': //超課題の設定(旧)
							if (!backwordCompatible) {
								vscode.window.showErrorMessage(
									'Command "parent" is no longer used. Enable "Recognize short hash and branchname without #" to enable it.');
								break;
							}
						case 'super': //超課題の設定
							this.#Super(c, cargs);
							break;
						case 'finish': //課題完了
							this.#CloseSub(cargs[2], c.hash);
							break;
						case 'reopen': //課題再開
							this.#OpenSub(cargs[2]);
						 	break;
						default:
							vscode.window.showErrorMessage(
								`Unrecognized dits command: ${c.message}`);
							break;
					}
					break;
				case 'Merge': //merge=finish
					if (backwordCompatible) {
						this.#CloseSub(cargs[2].slice(1, -1), c.hash);
					}
					break;
				default: //コマンドではないコミットのコメントはただのコメント
					c.label = c.message;
					this.log.push(c);
					break;
			}
		});

		//closedからラベルがない(=dits管理外)要素を除去
		this.#IgnoreUnlabeled();

		if (!this.currentTitle) {
			//カレントISSUEのタイトルがないときはブランチ名を設定しておく
			this.currentTitle = this.currentBranch = branchInfo.current;
		}
	}
};




class DitsRepository{
	/////インターフェイス
	LoadBranch() { //ブランチの読み込み
		if (!this.currentPath) {
			return;
		}
		this.git = new Git(this.currentPath);
		this.issue = new Issue(this.git.GetLog(), this.git.GetBranchInfo());
	}
	Release() { //リリース
		function PreNPost(property, path, rev) {
			var c =
				vscode.workspace.getConfiguration('dits').get(property).replace(/%V/, rev).split(' ');
			if (c.length) {
				var out = child_process.spawnSync(c[0], c.slice(1), { cwd: path });
				if (out.status) {
					var m = out.stderr.toString();
					if (!m.length) {
						m = out.stdout.toString();
					} else if (!m.length) {
						m = 'UNKNOWN ERRER';
					}
					vscode.window.showErrorMessage(m);
					return out.status;
				}
				vscode.window.showInformationMessage(out.stdout.toString());
			}
			return 0;
		}

		if (!this.currentPath) {
			return;
		}

		//仮リビジョン計算
		var rev = this.issue.lastRevision;
		if (rev) {
			var revs = rev.split('.');
			revs[2] = parseInt(revs[2]) + 1;
			rev = `${revs[0]}.${revs[1]}.${revs[2]}`;
		} else {
			rev = '0.0.0';
		}

		let options = {
			prompt: "Revision: ",
			placeHolder: "(revision to release)",
			value: rev
		}

		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				return;
			}
			value.trim();
			if (!value.length) {
				return;
			}

			//preRelease実行
			if (!!PreNPost('preRelease', this.currentPath, rev)) {
				//preRelease処理失敗
				return;
			}

			//リリースコミット生成
			const commitMessage = `.dits release ${value}`;
			this.git.CommitEmpty(commitMessage);
			vscode.commands.executeCommand('dits.refresh');

			//リリースノート生成
			var note = '# Release note\n\n';
			var r = null;
			this.issue.GetClosedList().forEach(e => {
				if (r != e.revision) {
					r = e.revision;
					note += `## ${r}\n`;
				}
				note += `* ${e.title}\n`;
			});
			fs.writeFileSync(`${this.currentPath}/RELEASE.md`, note, 'utf8');
			this.git.Do(['add', 'RELEASE.md']);
			this.git.Do(['commit', '--amend', `-m ${commitMessage}`]);

			this.git.Do(['tag', value]);
			this.git.DoR(['push', '--tags']);

			//postRelease実行
			PreNPost('postRelease', this.currentPath, rev);
		});
	}
	NewChild() { //副課題追加
		//入力欄情報
		let options = {
			prompt: "Title: ",
			placeHolder: "(title the new issue)"
		}

		//入力欄生成
		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				//キャンセル
				return;
			}
			value.trim();
			if (!value.length) {
				//入力なし
				return;
			}

			//コマンド生成
			this.git.CommitEmpty(`.dits new ${value}`);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}
	#PushSubIssue(branchName) {
		if (!this.git.DoR([
			'push',
			'--set-upstream',
			'origin',
			branchName],
			true)) {
			vscode.window.showWarningMessage(
				`Issue ${ticket.label} is already exsits.`);
			this.git.Do([
				'checkout',
				this.issue.currentBranch]);
			this.git.Do([
				'branch',
				'-D',
				branchName]);
			this.git.DoR(['fetch']);
			this.git.DoR([
				'branch',
				branchName,
				`origin/${branchName}`]);
		}
		vscode.commands.executeCommand('dits.refresh');
	}
	OpenChild(ticket) { //副課題を開く
		const branchName = `#${ticket.hash}`;
		const reopen = this.git.GetBranchInfo().IsIn(branchName);
		const fc = this.git.FindCommit(ticket.closedAt);
		const command = !reopen ?
			ticket.closedAt ?
				['checkout', '-b', branchName, fc.supers[1]] :
				['checkout', '-b', branchName] :
			['checkout', branchName];

		if (this.git.Do(command)) {
			if (!reopen) {
				if (!ticket.closedAt) {
					this.git.CommitEmpty(`.dits open ${ticket.title}`);
					this.git.CommitEmpty(
						'.dits super ' +
						this.issue.currentBranch + ' ' +
						this.issue.currentTitle);
				}
				this.#PushSubIssue(branchName);
			}
		}
		vscode.commands.executeCommand('dits.refresh');
	}
	async Finish() {
		//ファイルの追加忘れ防止のため未追跡ファイルがある場合確認する
		if (this.git.GetUntrackeds().length) {
			const choice = await vscode.window.showWarningMessage(
				'There are untracked files. Finish this issue?', 'Yes', 'No');
			if (choice === 'No') {
				return;
			}
		}
		//副課題がある場合、課題を終了できない
		if (this.issue.GetProgress().open) {
			vscode.window.showErrorMessage(
				'There are subIssues. First, Delete or Finish them.');
			return;
		}
		//親ブランチがあるのを確認してFinish
		if (this.issue.super) {
			if (this.git.Do(['checkout', this.issue.super.branch]) &&
				this.git.Do([
					'merge',
					'--no-ff',
					'--no-commit',
					this.issue.currentBranch]) &&
				this.git.CommitEmpty(`.dits finish ${this.issue.currentBranch}`) &&
				this.git.Do(['branch', '-D', this.issue.currentBranch]) &&
				this.git.DoR([
					'push', 'origin', `:${this.issue.currentBranch}`])) {
				vscode.commands.executeCommand('dits.refresh');
			} else {
				vscode.window.showErrorMessage(
					'Failed some operations. Check & Try manually.');
			}
		} else {
			vscode.window.showErrorMessage(
				'The super issue has not specified. Try manually.');
		}
	}
	GoParent() {
		if (this.issue.super) {
			if (this.git.Do(['checkout', this.issue.super.branch])) {
				vscode.commands.executeCommand('dits.refresh');
			}
		} else {
			vscode.window.showErrorMessage(
				'The super issue has not specified. Try manually.');
		}
	}
	async Delete() {
		if (this.issue.GetProgress().open) {
			vscode.window.showErrorMessage(
				'There are subIssues. First, Delete or Finish them.');
			return;
		}
		if (!this.issue.super) {
			vscode.window.showErrorMessage(
				`${this.issue.currentTitle} might not an issue.`);
			return;
		}
		const choice = await vscode.window.showWarningMessage(
			`delete ${this.issue.currentTitle}?`, 'yes', 'no');
		if (choice === 'yes') {
			if (this.git.Do(['checkout', this.issue.super.branch])) {
				this.git.CommitEmpty(
					`.dits delete ${this.issue.currentBranch}`);
				this.git.Do(['branch', '-D', this.issue.currentBranch]);
				this.git.DoR([
					'push',
					'origin',
					`:${this.issue.currentBranch}`]);
			}
			vscode.commands.executeCommand('dits.refresh');
		}
	}
	async DeleteSub(v) {
		if (v.IsOpened()) {
			vscode.window.showErrorMessage(
				`Issue ${v.title} is opened already. First, Open it.`);
			return;
		}
		const choice = await vscode.window.showWarningMessage(
			`delete ${v.title}?`, 'yes', 'no');
		if (choice === 'yes') {
			this.git.CommitEmpty(`.dits delete #${v.hash}`);
			vscode.commands.executeCommand('dits.refresh');
		}
	}
	Chdir(path) {
		if (path) {
			this.currentPath = path;
			this.LoadBranch();
			vscode.commands.executeCommand('dits.refresh');
		}
	}


	#InputAndDo(ToDo, title = '', placeHalder = '') {
		let options = { prompt: title, placeHolder: placeHalder };

		//入力欄生成
		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				//キャンセル
				return;
			}
			value.trim();
			if (!value.length) {
				//入力なし
				return;
			}

			ToDo(value);

			//ブランチ再読込
			vscode.commands.executeCommand('dits.refresh');
		});
	}
	Commit() {
		this.#InputAndDo(v => {
			this.git.CommitEmpty(v);
		}, '', 'Message to commit "as is"');
	}
	CommitAll() {
		this.#InputAndDo(v => {
			this.git.Do(['commit', '-a', '-m', v]);
		}, '', 'Message to commit "all"');
	}
	async Reopen(target) {
		if (target.revision) {
			const choice = await vscode.window.showWarningMessage(
				`issue \'${target.title}\' had be released already. Reopen it?`,
				'yes', 'no');
			if (choice == 'no') {
				return;
			}
		}
		const fc = this.git.FindCommit(target.closedAt);
		if (!fc) {
			//取得できなかった
			vscode.window.showErrorMessage('Something went wrong. Sorry!');
			return;
		}
		const branchName = `#${target.hash}`;
		this.git.CommitEmpty(`.dits reopen ${branchName}`);
		this.git.Do(['branch', branchName, fc.supers[1]]);
		this.#PushSubIssue(branchName);
		vscode.commands.executeCommand('dits.refresh');
	}
	async Revert(target) {
		if (target.revision) {
			const choice = await vscode.window.showWarningMessage(
				`issue \'${target.title}\' had be released already. Revert it?`,
				'yes', 'no');
			if (choice == 'no') {
				return;
			}
		}
		this.git.Do(['revert', target.hash]);
		vscode.commands.executeCommand('dits.refresh');
	}
	Update() {
		let options = {
			prompt: "Update from: ",
			placeHolder: "(merge form to update)",
			value: updateFrom
		}

		vscode.window.showInputBox(options).then((value) => {
			if (!value) {
				return;
			}
			value.trim();
			if (!value.length) {
				return;
			}

			this.git.Do([
				'merge',
				'--no-ff',
				'-m', `update from ${updateFrom}`,
				updateFrom]);

			vscode.commands.executeCommand('dits.refresh');
		});
	}


	/////アクセサ
	GetSub() {
		return this.issue.GetLivingList();
	}
	GetLog() {
		return this.issue.log;
	}
	GetIssueInfo() {
		//owner取得
		var owner = null;
		if (this.issue.ownerCommit) {
			owner = this.git.Do([
				'log',
				'--no-walk',
				'--pretty=short',
				this.issue.ownerCommit]).split('\n')[1].slice(8);
		}

		//データ生成
		return {
			title: this.issue.currentTitle,
			progress: this.issue.GetProgress(),
			owner: owner,
			super: this.issue.super,
			untrackeds: this.git.GetUntrackeds(),
			stageds: this.git.GetStageds(),
			modifieds: this.git.GetModifieds()
		};
	}
	GetClosedSub() {
		return this.issue.GetClosedList();
	}

	constructor() {
		//ワークディレクトリのパスを取得
		if (vscode.workspace.workspaceFolders) {
			this.currentPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		}

		//workspacesにTreeViewを設定
		vscode.window.createTreeView('workspaces', {
			treeDataProvider: new WorkspaceProvider()
		});

		//Issue読み込み
		this.LoadBranch();
	}
}

class WorkspaceProvider {
	constructor() {
		this.list = [];
		if (vscode.workspace.workspaceFolders) {
			vscode.workspace.workspaceFolders.forEach(element => {
				this.list.push({
					label: element.name,
					path: element.uri.fsPath,
					command: {
						command: 'dits.chdir',
						arguments: [element.uri.fsPath]
					}
				});
			});
		}
	}
	getTreeItem(v) {
		return v;
	}
	getChildren(v) {
		return this.list;
	}
}
exports.DitsRepository = DitsRepository;
