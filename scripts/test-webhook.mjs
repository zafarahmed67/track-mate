const testWebhook = async () => {
  const webhookUrl = "https://track-mate-demo.vercel.app/api/webhook"

  const testPayload = {
    contactId: "test-contact-" + Date.now(),
    first_name: "Test",
    last_name: "User",
    full_name: "Test User",
    email: "test" + Date.now() + "@yopmail.com",
    phone: "+1234567890",
    tags: ["test"],
    timezone: "Asia/Karachi",
    created_at: new Date().toISOString(),
    company_name: "Test Company",
    contact_type: "lead",
    location: {
      name: "Test Location",
      address: "123 Test St",
      city: "Test City",
      state: "TS",
      postalCode: "12345",
      country: "US",
      fullAddress: "123 Test St, Test City, TS 12345",
      id: "loc-123"
    },
    order: {
      funnelId: "funnel-123",
      pageId: "page-123",
      interProductId: "prod-123",
      interPriceId: "price-123",
      productId: "product-123",
      productName: "Test Product",
      amount: 99.99,
      quantity: 1,
      currency: "USD",
      paymentMethod: "stripe",
      submissionType: 1
    },
    workflow: {
      id: "wf-123",
      name: "Test Workflow"
    }
  }

  console.log("Testing webhook with payload:", JSON.stringify(testPayload, null, 2))

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testPayload),
    })

    const result = await response.json()
    console.log("Response status:", response.status)
    console.log("Response:", JSON.stringify(result, null, 2))

    if (result.magicLink) {
      console.log("\n=== MAGIC LINK ===")
      console.log(result.magicLink)
      console.log("==================\n")
    }
  } catch (error) {
    console.error("Error:", error)
  }
}

testWebhook()
