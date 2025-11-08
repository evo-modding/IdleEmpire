<?php
// --- START FIX: Added CORS headers for mobile/cross-domain compatibility ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}
// --- END FIX ---

session_start();
header('Content-Type: application/json');
require_once 'db.php'; // <-- make sure this defines $pdo (PDO connection)

$action = $_GET['action'] ?? '';

function jsonResponse($arr){
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    switch ($action) {
        // ---------- REGISTER ----------
        case 'register':
            $u = trim($_POST['username'] ?? '');
            $p = trim($_POST['password'] ?? '');
            if (strlen($u) < 3 || strlen($p) < 6)
                jsonResponse(['success'=>false, 'error'=>'Username ≥3, password ≥6 chars']);

            // check if exists
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username=? LIMIT 1");
            $stmt->execute([$u]);
            if ($stmt->fetch()) jsonResponse(['success'=>false, 'error'=>'Username already taken']);

            $hash = password_hash($p, PASSWORD_DEFAULT);
            // --- FIX: Include gems column in insert (defaults to 0) ---
            $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (?,?)");
            $stmt->execute([$u, $hash]);

            jsonResponse(['success'=>true]);

        // ---------- LOGIN ----------
        case 'login':
            $u = trim($_POST['username'] ?? '');
            $p = trim($_POST['password'] ?? '');
            if ($u==='' || $p==='') jsonResponse(['success'=>false,'error'=>'Missing fields']);
            // --- FIX: Select gems column ---
            $stmt = $pdo->prepare("SELECT id, username, password_hash, gems FROM users WHERE username=? LIMIT 1");
            $stmt->execute([$u]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user && password_verify($p, $user['password_hash'])) {
                $_SESSION['user_id'] = $user['id'];
                // --- FIX: Return gems in response ---
                jsonResponse(['success'=>true,'id'=>$user['id'],'username'=>$user['username'], 'gems'=>$user['gems']]);
            } else {
                jsonResponse(['success'=>false,'error'=>'Invalid username or password']);
            }

        // ---------- STATUS ----------
        case 'status':
            if (!empty($_SESSION['user_id'])) {
                // --- FIX: Select gems column ---
                $stmt = $pdo->prepare("SELECT id, username, gems FROM users WHERE id=? LIMIT 1");
                $stmt->execute([$_SESSION['user_id']]);
                $u = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($u) jsonResponse(['logged'=>true,'id'=>$u['id'],'username'=>$u['username'], 'gems'=>$u['gems']]);
            }
            jsonResponse(['logged'=>false]);

        // ---------- LOGOUT ----------
        case 'logout':
            session_destroy();
            jsonResponse(['success'=>true]);

        default:
            jsonResponse(['success'=>false,'error'=>'Invalid action']);
    }
} catch (Exception $e) {
    jsonResponse(['success'=>false,'error'=>'Server error: '.$e->getMessage()]);
}
?>