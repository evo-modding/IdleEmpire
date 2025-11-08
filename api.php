<?php
// Add CORS headers for mobile app compatibility
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

session_start();
header('Content-Type: application/json');
require_once 'db.php';
// --- NEW: Require Composer autoload for Stripe PHP library ---
require '../vendor/autoload.php';
// --- END NEW ---

if(empty($_SESSION['user_id'])) {
    echo json_encode(['success'=>false,'error'=>'Not logged in']);
    exit;
}
$user_id = $_SESSION['user_id'];
$action = $_GET['action'] ?? '';

// --- NEW: Initialize Stripe Client ---
try {
    \Stripe\Stripe::setApiKey(STRIPE_SECRET_KEY);
    $stripe = new \Stripe\StripeClient(STRIPE_SECRET_KEY);
} catch (Exception $e) {
    // Note: This error only affects the API call, not the whole server
    // For simplicity, we just log it and let the script continue for non-Stripe actions
    error_log("Stripe Initialization Error: " . $e->getMessage());
}
// --- END NEW ---

if($action === 'save') {
    $rawData = file_get_contents("php://input");
    $decoded = json_decode($rawData, true);
    
    // Validate that we have valid JSON
    if(json_last_error() !== JSON_ERROR_NONE) {
        echo json_encode(['success'=>false,'error'=>'Invalid JSON data']);
        exit;
    }
    
    // Ensure all required fields exist
    if(!isset($decoded['gemItems'])) $decoded['gemItems'] = new stdClass();
    if(!isset($decoded['activeBoosts'])) $decoded['activeBoosts'] = [];
    
    // Get current timestamp in milliseconds
    $currentTime = round(microtime(true) * 1000);
    
    // Re-encode to ensure proper format
    $jsonData = json_encode($decoded);
    
    // Check if save exists
    $stmt = $pdo->prepare("SELECT id FROM saves WHERE user_id=? LIMIT 1");
    $stmt->execute([$user_id]);
    $existing = $stmt->fetch();
    
    if($existing) {
        // Update existing save with last_online timestamp
        $stmt = $pdo->prepare("UPDATE saves SET data=?, updated_at=NOW(), last_online=? WHERE user_id=?");
        $stmt->execute([$jsonData, $currentTime, $user_id]);
    } else {
        // Insert new save with last_online timestamp
        $stmt = $pdo->prepare("INSERT INTO saves (user_id, data, last_online) VALUES (?, ?, ?)");
        $stmt->execute([$user_id, $jsonData, $currentTime]);
    }
    
    echo json_encode(['success'=>true]);
    exit;
}

if($action === 'load') {
    // --- FIX: Also fetch the user's current gem balance from the users table ---
    $stmtUser = $pdo->prepare("SELECT gems FROM users WHERE id=? LIMIT 1");
    $stmtUser->execute([$user_id]);
    $userGems = $stmtUser->fetchColumn() ?: 0;

    $stmt = $pdo->prepare("SELECT data, last_online FROM saves WHERE user_id=? LIMIT 1");
    $stmt->execute([$user_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if($row && !empty($row['data'])) {
        $saveData = json_decode($row['data'], true);
        
        // Ensure items is always an object/associative array
        if(!isset($saveData['items']) || !is_array($saveData['items'])) {
            $saveData['items'] = [];
        }
        if(empty($saveData['items'])) {
            $saveData['items'] = new stdClass();
        }
        
        // Ensure gem items exists
        if(!isset($saveData['gemItems']) || !is_array($saveData['gemItems'])) {
            $saveData['gemItems'] = [];
        }
        if(empty($saveData['gemItems'])) {
            $saveData['gemItems'] = new stdClass();
        }
        
        // Ensure active boosts exists
        if(!isset($saveData['activeBoosts'])) {
            $saveData['activeBoosts'] = [];
        }
        
        // Ensure other fields exist
        // --- FIX: Overwrite client-side gems with server-side gems for authority ---
        $saveData['gems'] = $userGems; 
        if(!isset($saveData['gold'])) $saveData['gold'] = 0;
        if(!isset($saveData['gps'])) $saveData['gps'] = 0;
        if(!isset($saveData['updatedAt'])) $saveData['updatedAt'] = time() * 1000;
        
        // Calculate offline earnings
        $currentTime = round(microtime(true) * 1000);
        $lastOnline = $row['last_online'];
        $offlineEarnings = 0;
        $offlineSeconds = 0;

        // --- START FIX: Calculate boost multiplier for offline period ---
        // This is a simplified calculation: it applies the max boost that was
        // active *at the time the user went offline* for the whole duration.
        $boostMultiplier = 1;
        if (is_array($saveData['activeBoosts'])) {
            foreach ($saveData['activeBoosts'] as $b) {
                if (isset($b['endsAt']) && $b['endsAt'] > $lastOnline && isset($b['multiplier']) && $b['multiplier'] > $boostMultiplier) {
                    $boostMultiplier = $b['multiplier'];
                }
            }
        }
        // --- END FIX ---
        
        if($lastOnline && $saveData['gps'] > 0) {
            $offlineMs = $currentTime - $lastOnline;
            $offlineSeconds = floor($offlineMs / 1000);
            
            // Cap offline earnings to 24 hours (86400 seconds)
            $maxOfflineSeconds = 86400;
            if($offlineSeconds > $maxOfflineSeconds) {
                $offlineSeconds = $maxOfflineSeconds;
            }
            
            if($offlineSeconds > 0) {
                // --- START FIX: Apply boost multiplier to earnings ---
                $offlineEarnings = ($saveData['gps'] * $boostMultiplier) * $offlineSeconds;
                // --- END FIX ---
                $saveData['gold'] += $offlineEarnings;
            }
        }
        
        echo json_encode([
            'success'=>true,
            'data'=>$saveData,
            'offline'=>[
                'earnings'=>$offlineEarnings,
                'seconds'=>$offlineSeconds
            ]
        ]);
    } else {
        // --- FIX: If no save data exists, return a default state with server-side gems ---
        echo json_encode(['success'=>true, 'data'=>['gems'=>$userGems,'gold'=>0,'gps'=>0,'items'=>new stdClass(),'gemItems'=>new stdClass(),'activeBoosts'=>[]]]);
    }
    exit;
}

// --- NEW: CREATE CHECKOUT SESSION ---
if($action === 'create_checkout_session') {
    $data = file_get_contents("php://input");
    $pack = json_decode($data, true);
    
    // Hardcoded gem packs (Amounts are in cents for Stripe)
    $gem_packs = [
      'g50' => ['name' => '50 Gems', 'amount' => 50, 'price' => 0.99, 'price_cents' => 99],
      'g300' => ['name' => '300 Gems', 'amount' => 300, 'price' => 4.99, 'price_cents' => 499],
      'g1000' => ['name' => '1000 Gems', 'amount' => 1000, 'price' => 14.99, 'price_cents' => 1499]
    ];
    
    if(!isset($pack['packId']) || !isset($gem_packs[$pack['packId']])) {
        echo json_encode(['success'=>false,'error'=>'Invalid pack ID']);
        exit;
    }
    
    $selected_pack = $gem_packs[$pack['packId']];

    try {
        $session = $stripe->checkout->sessions->create([
            'payment_method_types' => ['card'],
            'line_items' => [[
                'price_data' => [
                    'currency' => 'usd',
                    'unit_amount' => $selected_pack['price_cents'], // Price in cents
                    'product_data' => [
                        'name' => $selected_pack['name'] . ' for Idle Empire',
                        'description' => 'In-game premium currency purchase',
                    ],
                ],
                'quantity' => 1,
            ]],
            'mode' => 'payment',
            // Success URL will call back to our server to fulfill the order
            'success_url' => 'http://evohosting.cloud/idle/api.php?action=fulfill_purchase&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => 'http://evohosting.cloud/idle/index.html?payment=cancelled',
            // Pass user_id and gems to the payment intent metadata for later fulfillment
            'metadata' => [
                'user_id' => $user_id,
                'gems_to_grant' => $selected_pack['amount'],
                'pack_id' => $pack['packId']
            ],
        ]);
        
        // --- FIX: Use sessionId to redirect (for client-side JS) ---
        echo json_encode(['success'=>true, 'sessionId'=>$session->id, 'redirectUrl'=>$session->url]);

    } catch (Exception $e) {
        echo json_encode(['success'=>false, 'error'=>'Stripe session creation failed: ' . $e->getMessage()]);
    }
    exit;
}
// --- END NEW: CREATE CHECKOUT SESSION ---

// --- NEW: FULFILL PURCHASE (SIMULATED WEBHOOK/REDIRECT) ---
if($action === 'fulfill_purchase') {
    $session_id = $_GET['session_id'] ?? '';
    
    // Redirect the user back to the index page immediately with a status
    header('Location: index.html?payment=success');
    
    // Use the session ID to verify the payment and grant gems
    try {
        $session = $stripe->checkout->sessions->retrieve($session_id);
        
        if($session->payment_status === 'paid') {
            $gems_to_grant = (int)$session->metadata['gems_to_grant'];
            $pack_id = $session->metadata['pack_id'];
            $paid_amount = $session->amount_total; // in cents

            // Use the session_id to check if it has already been processed (prevent double-granting)
            $stmtCheck = $pdo->prepare("SELECT id FROM purchases WHERE session_id = ?");
            $stmtCheck->execute([$session_id]);
            if ($stmtCheck->fetch()) {
                 error_log("Stripe Fulfillment: Session {$session_id} already processed.");
                 exit;
            }
            
            // 1. Grant Gems to the user (Update the users table)
            $stmt = $pdo->prepare("UPDATE users SET gems = gems + ? WHERE id = ?");
            $stmt->execute([$gems_to_grant, $user_id]); 

            // 2. Log the purchase
            $stmt = $pdo->prepare("INSERT INTO purchases (user_id, pack_id, gems, price, purchase_timestamp, session_id) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $user_id, 
                $pack_id, 
                $gems_to_grant, 
                $paid_amount / 100, // convert cents to dollars
                time() * 1000,
                $session_id
            ]);
            
        }
    } catch (Exception $e) {
        error_log("Stripe Fulfillment Error for Session {$session_id}: " . $e->getMessage());
    }
    exit;
}
// --- END NEW: FULFILL PURCHASE (SIMULATED WEBHOOK/REDIRECT) ---

// --- REMOVED: Old log_purchase action ---

echo json_encode(['success'=>false,'error'=>'Invalid action']);
?>