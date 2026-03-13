// MongoDB helper stubs
use mongodb::{Client, Collection};
use serde_json::Value;
use mongodb::bson::{doc, oid::ObjectId, to_bson, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Intent {
    #[serde(rename = "_id")]
    pub id: Option<ObjectId>,
    pub userId: String,
    pub fromToken: String,
    pub toToken: String,
    pub amount: f64,
    pub chainId: i64,
    pub status: Option<String>,
    #[serde(default)]
    pub slippage: Option<f64>,
}

pub struct Db {
    pub client: Client,
}

impl Db {
    pub async fn connect(uri: &str) -> anyhow::Result<Self> {
        let client = Client::with_uri_str(uri).await?;
        Ok(Self { client })
    }
    pub async fn insert_intent(&self, intent: Intent) -> anyhow::Result<ObjectId> {
        let db = self.client.database("fluxor");
        let col: Collection<Intent> = db.collection("intents");
    let insert_res = col.insert_one(&intent, None).await?;
        if let Some(id) = insert_res.inserted_id.as_object_id() {
            Ok(id)
        } else {
            Err(anyhow::anyhow!("failed to get inserted id"))
        }
    }

    pub async fn get_intent(&self, id: &str) -> anyhow::Result<Option<Intent>> {
        let db = self.client.database("fluxor");
        let col: Collection<Intent> = db.collection("intents");
        let oid = ObjectId::parse_str(id)?;
        let filter = doc! {"_id": oid};
        let res = col.find_one(filter, None).await?;
        Ok(res)
    }

    pub async fn update_intent_best_route(&self, id: &Option<ObjectId>, best_route: Value) -> anyhow::Result<()> {
        let db = self.client.database("fluxor");
        let col = db.collection::<mongodb::bson::Document>("intents");
        // Use the ObjectId directly when available to avoid stringification/parsing errors
        if let Some(oid) = id {
            let quoted_at = BsonDateTime::now();
            let update = doc! {"$set": {"bestRoute": to_bson(&best_route)?, "status": "quoted", "quotedAt": quoted_at}};
            col.update_one(doc!{"_id": oid}, update, None).await?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("missing intent id when updating best route"))
        }
    }

    /// Update the intent status and optional reason field.
    pub async fn update_intent_status(&self, id: &Option<ObjectId>, status: &str, reason: Option<&str>) -> anyhow::Result<()> {
        let db = self.client.database("fluxor");
        let col = db.collection::<mongodb::bson::Document>("intents");
        if let Some(oid) = id {
            let mut set_doc = doc! {"status": status};
            if let Some(r) = reason {
                set_doc.insert("reason", r);
            }
            let update = doc! {"$set": set_doc };
            col.update_one(doc!{"_id": oid}, update, None).await?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("missing intent id when updating status"))
        }
    }
}
