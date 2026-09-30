# Render 공용 서버 배포

이 소스에는 실제 공용 서버 주소가 포함되어 있지 않습니다. 배포 전에는 외부 연결이 완료된 상태가 아닙니다.

1. Render와 GitHub 계정에 로그인합니다.
2. 서버 전용 ZIP의 내용(package.json, package-lock.json, server.cjs, public, render.yaml)을 GitHub 저장소 루트에 올립니다.
3. Render에서 New → Blueprint → 저장소 선택 → Free 서비스로 배포합니다. 또는 New → Web Service로 Node 런타임, Build `npm ci --omit=dev --ignore-scripts`, Start `node server.cjs`, Health `/health`를 지정합니다.
4. 배포가 Live가 되면 실제 `https://...onrender.com` 주소를 복사합니다.
5. PC 0.7 앱의 온라인 서버 설정에 주소를 입력하고 서버 연결·저장을 누릅니다. 양쪽 PC에 같은 주소를 설정합니다.
6. 방을 만든 뒤 휴대폰 초대 링크를 전달합니다. 휴대폰은 별도의 서버 주소 입력 없이 HTTPS 링크에서 입장합니다.

RENDER_EXTERNAL_URL 환경값은 서버가 브라우저 origin을 검증하는 데 사용합니다. 자체 서버에서는 PUBLIC_ORIGIN을 실제 HTTPS origin으로 지정하세요. Electron PC 앱의 http://localhost:임시포트 출처도 허용합니다.
서버 전역 accessToken은 공용 서비스에 적용하지 않습니다. 방은 40비트 임의 코드로 구분하고 최대 두 명, 방장만 화면과 게임 결과를 보냅니다. 계정·결제·광범위한 남용 방어는 상용화 전에 추가해야 합니다.

HTTPS/WSS는 Render가 처리합니다. 직접 WebRTC가 실패하면 이미 구현한 WebSocket JPEG/게임 입력 중계를 사용하므로 TURN 없이도 대체 경로가 있습니다. 재배포/재시작하면 메모리에 있던 방은 사라져 재입장이 필요합니다. 인스턴스는 하나로 유지하세요. 다중 인스턴스는 방 공유 저장소를 추가하기 전까지 지원하지 않습니다.

Free 서비스는 유휴 상태에서 내려가며 첫 연결이 느릴 수 있습니다. Starter 등 유료 플랜 변경과 대역폭 요금은 별도로 확인하세요. 자동으로 유료 플랜을 만들지 않습니다.

공식 문서: https://render.com/docs/websocket , https://render.com/docs/free , https://render.com/docs/deploy-node-express-app
