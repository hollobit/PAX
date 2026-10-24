-- 카카오톡 Mac 앱의 채팅방 하나에 메시지 한 건을 보낸다 (System Events UI 자동화).
-- 사용: osascript scripts/kakao_send.applescript "<방 이름(정확히 일치)>|@me" "<본문 파일 경로>"
--
-- kakaocli send를 쓰지 않는 이유(2026-10-21 실측): 채팅 목록이 수백 개면 AX 탐색에 2~3분이 걸리고
-- 방 창을 여는 단계가 자주 실패하며("Could not find the message input field"), 방 이름을 부분 일치로
-- 고른다. 여기서는 최근 순 상위 MAX_ROWS개 안에서 이름이 정확히 같은 방만 열고, 열린 창의 제목이
-- 방 이름과 같은지 다시 확인한 뒤에만 입력한다 — 다른 방으로 잘못 보내는 것을 막는 장치다.
-- 본문은 파일로 받는다(여러 줄·이모지를 인자로 넘기면 따옴표 처리가 깨지기 쉽다).
-- 실패하면 오류로 끝나고(종료 코드 1), 도착 여부 확인과 재시도는 호출하는 쪽(kakao_digest.sh)이 한다.

property MAX_ROWS : 40
property WAIT_STEPS : 8 -- 0.5초 × 8 = 창이 뜰 때까지 시도마다 최대 4초
property OPEN_TRIES : 3

-- 이름 없는 창(팝업·임시 창)을 닫는다. 2026-10-24 06:00 실측: 이름 없는 창이 떠 있을 때 방 창·입력창은
-- 제대로 잡고도 Enter만 세 번 다 헛돌았고, 그 창이 사라진 뒤 같은 상태로 다시 돌리자 바로 보내졌다.
-- 키 입력을 가로채는 것으로 보고 보내기 전에 치운다. 메인 창은 이름이 있어 대상이 아니다.
-- 뒤에서부터 순번으로 돈다(닫으면 순번이 당겨지므로). 닫기 버튼이 없으면 앞으로 올려 Esc.
on closeUnnamedWindows()
	tell application "System Events" to tell process "KakaoTalk"
		repeat with i from (count of windows) to 1 by -1
			try
				set w to window i
				set nm to name of w
				if nm is missing value then set nm to ""
				if nm is "" and (value of attribute "AXIdentifier" of w) is not "Main Window" then
					try
						click (first button of w whose subrole is "AXCloseButton")
					on error
						perform action "AXRaise" of w
						delay 0.2
						key code 53
					end try
					delay 0.3
				end if
			end try
		end repeat
	end tell
end closeUnnamedWindows

-- 방 창의 입력창: 표(메시지 목록)가 없는 스크롤 영역 안의 텍스트 영역 중 맨 아래 것.
-- 새 메시지가 오면 입력창 바로 위에 미리보기 말풍선(역시 텍스트 영역)이 떠서, 첫 것을 고르면 말풍선에
-- 본문을 넣고 Enter가 헛돈다(2026-10-23~25 새벽 실패의 원인 — 06시 직전 자동 게시글 미리보기).
-- 반환값은 'scroll area k' 순번 참조라 말풍선이 사라지면 다른 칸을 가리킨다 → 쓸 때마다 다시 부른다.
on findInput(chatWin)
	tell application "System Events"
		set found to missing value
		set bestY to -1
		repeat with sa in scroll areas of chatWin
			try
				if (count of tables of sa) is 0 and (count of text areas of sa) > 0 then
					set y to item 2 of (position of sa as list)
					if y > bestY then
						set bestY to y
						set found to text area 1 of sa
					end if
				end if
			end try
		end repeat
		return found
	end tell
end findInput

-- '전송' 버튼(입력창이 비면 꺼진다). 없으면 missing value — 그때는 버튼 검증을 건너뛴다.
on findSendButton(chatWin)
	tell application "System Events"
		try
			return first button of chatWin whose title is "전송"
		end try
		return missing value
	end tell
end findSendButton

on run argv
	set roomName to item 1 of argv
	set body to read POSIX file (item 2 of argv) as «class utf8»
	if body ends with linefeed then set body to text 1 thru -2 of body

	tell application "KakaoTalk" to activate
	delay 0.5
	closeUnnamedWindows()
	tell application "System Events" to tell process "KakaoTalk"
		-- 창은 이름으로 다시 잡는다: `repeat with w in windows`의 w는 'item k of every window'(순번 참조)라서
		-- AXRaise로 창 순서가 바뀌면 다른 창을 가리킨다(2026-10-23 실측: 1:1 대화창이 여럿 열려 있을 때
		-- '창 제목 불일치'·'Enter가 들어가지 않음'으로 실패).
		set mainWin to missing value
		-- 입력 소스 표시기(입력창 아래 'A' 동그라미)는 이 프로세스의 이름 없는 작은 창으로 잡히고 AXIdentifier가
		-- 없어 읽으면 오류가 난다(2026-10-25 실측) → 창마다 try로 건너뛴다.
		repeat with w in windows
			try
				if value of attribute "AXIdentifier" of w is "Main Window" then set mainWin to window (name of w)
			end try
		end repeat
		if mainWin is missing value then error "메인 창 없음"
		-- 채팅 목록 검색칸에 글자가 남아 있으면 목록이 검색 결과로 줄어 방을 못 찾는다(2026-10-24 실측:
		-- 검색어가 남아 행이 2개뿐이라 '나와의 채팅을 찾지 못함'). 비어 있지 않으면 지운다(사용자 지시 2026-10-24).
		-- 값만 바꾸면 목록 필터가 갱신되지 않을 수 있어, 칸에 포커스를 주고 전체 선택 + 지우기 키로 지운다.
		try
			set searchField to text field 1 of mainWin
			if (value of searchField as text) is not "" then
				set frontmost to true
				perform action "AXRaise" of mainWin
				set value of attribute "AXMain" of mainWin to true
				delay 0.3
				set focused of searchField to true
				delay 0.2
				keystroke "a" using command down
				key code 51
				delay 1
				if (value of searchField as text) is not "" then error "검색칸을 비우지 못함 — 중단"
			end if
		on error errMsg
			if errMsg contains "검색칸" then error errMsg
		end try
		set t to table 1 of scroll area 1 of mainWin
		set n to count of rows of t
		if n > MAX_ROWS then set n to MAX_ROWS

		-- 1) 방 찾기: 이름 정확히 일치(@me면 '나' 배지가 붙은 방의 이름).
		--    목록은 새 메시지마다 순서가 바뀌므로, 고른 행의 이름을 선택 직전에 다시 읽어 맞을 때만 쓴다.
		set targetName to roomName
		if roomName is "@me" then
			set targetName to ""
			repeat with i from 1 to n
				set r to row i of t
				if (description of every image of UI element 1 of r) contains "badge me" then
					set targetName to value of static text 1 of UI element 1 of r
					exit repeat
				end if
			end repeat
			if targetName is "" then error "나와의 채팅을 찾지 못함"
		end if
		set target to missing value
		repeat 3 times
			set names to value of static text 1 of UI element 1 of (rows 1 thru n of t)
			repeat with i from 1 to (count of names)
				if item i of names is targetName then
					if (value of static text 1 of UI element 1 of row i of t) is targetName then set target to row i of t
					exit repeat
				end if
			end repeat
			if target is not missing value then exit repeat
			delay 1
		end repeat
		if target is missing value then error "방을 찾지 못함: " & targetName

		-- 2) 방 창 열기(이미 열려 있으면 그 창을 쓴다)
		set chatWin to missing value
		repeat with w in windows
			if name of w is targetName then set chatWin to window targetName
		end repeat
		-- 직전 전송 직후에는 첫 Enter가 헛도는 일이 잦다(2026-10-21 실측: 성공·실패가 번갈아) → 최대 3번
		repeat OPEN_TRIES times
			if chatWin is not missing value then exit repeat
			-- Enter는 앞 창·주 창의 포커스 요소로만 간다: 메인 창을 올리고 목록 표에 포커스를 준 뒤 행 선택 + Enter
			set frontmost to true
			perform action "AXRaise" of mainWin
			set value of attribute "AXMain" of mainWin to true
			delay 0.3
			set focused of t to true
			set selected of target to true
			delay 0.3
			if (value of static text 1 of UI element 1 of target) is not targetName then error "선택 중 목록 순서 바뀜 — 중단"
			key code 36
			repeat WAIT_STEPS times
				delay 0.5
				repeat with w in windows
					if name of w is targetName then set chatWin to window targetName
				end repeat
				if chatWin is not missing value then exit repeat
			end repeat
		end repeat
		if chatWin is missing value then error "방 창이 열리지 않음: " & targetName

		-- 3) 입력창(맨 아래 텍스트 영역 — findInput 참고)
		set inputField to my findInput(chatWin)
		if inputField is missing value then error "입력창 없음: " & targetName

		-- 4) 입력 직전에 창 제목을 다시 확인하고 보낸다
		-- Enter는 앞 창·주 창에만 들어간다: 앱을 앞으로, 방 창을 주 창으로 올린 뒤 보낸다
		-- 방 창을 연 사이에 뜬 이름 없는 창도 다시 치운다(입력창에 본문을 넣기 전이라 Esc가 헛돌아도 잃을 것이 없다)
		my closeUnnamedWindows()
		set frontmost to true
		perform action "AXRaise" of chatWin
		set value of attribute "AXMain" of chatWin to true
		delay 0.3
		if name of chatWin is not targetName then error "창 제목 불일치 — 중단"
		set focused of inputField to true
		set value of inputField to body
		delay 0.5
		-- 진짜 입력창이면 내용이 들어가는 순간 '전송' 버튼이 켜진다 — 안 켜지면 엉뚱한 칸이므로 보내지 않는다
		set sendBtn to my findSendButton(chatWin)
		if sendBtn is not missing value then
			if not (enabled of sendBtn) then
				try
					set value of inputField to ""
				end try
				error "입력창 판별 실패(전송 버튼 꺼짐) — 중단"
			end if
		end if
		-- Enter가 먹었는지는 입력창이 비었는지로 본다. 안 비었으면 다시 앞으로 올려 누르고,
		-- 끝내 안 되면 입력창을 비워(임시 저장 글로 남지 않게) 실패로 끝낸다.
		set sentOk to false
		repeat 3 times
			set frontmost to true
			set value of attribute "AXMain" of chatWin to true
			set inputField to my findInput(chatWin)
			set focused of inputField to true
			delay 0.3
			key code 36
			delay 1
			set inputField to my findInput(chatWin)
			if (value of inputField) is "" then
				set sentOk to true
				exit repeat
			end if
		end repeat
		if not sentOk then
			set value of (my findInput(chatWin)) to ""
			error "Enter가 들어가지 않음 — 입력창을 비우고 중단"
		end if
		-- 5) 방 창 닫기(닫기 버튼)
		try
			click (first button of chatWin whose subrole is "AXCloseButton")
		end try
		delay 0.5
		try -- 닫는 사이 창 목록이 바뀌어도 이미 보낸 뒤이므로 실패로 치지 않는다
			repeat with w in windows
				if name of w is targetName then
					perform action "AXRaise" of w
					keystroke "w" using command down
				end if
			end repeat
		end try
	end tell
	return "sent: " & targetName
end run
