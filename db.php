<?php
$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: '';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASS') ?: '';
$dsn = "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";

// --- NEW: Stripe Configuration ---
// The first part is the NAME, the second part is the VALUE.
// NEVER share the sk_live_ key.

// Use environment variables if possible, otherwise hardcode your keys here.
define('STRIPE_SECRET_KEY', getenv('STRIPE_SECRET_KEY') ?: '');
define('STRIPE_PUBLISHABLE_KEY', getenv('STRIPE_PUBLISHABLE_KEY') ?: '');
// --- END NEW ---

try {
  $pdo = new PDO($dsn, $dbUser, $dbPass, [
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
  ]);
} catch (Exception $e){
  http_response_code(500);
  header('Content-Type: application/json');
  echo json_encode(['success'=>false,'error'=>'DB connection failed']); exit;
}
?>

