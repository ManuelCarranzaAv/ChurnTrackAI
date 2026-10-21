"""Optional reproducible training. Does not overwrite the supplied serving artifact.
Install requirements-training.txt first. Generates models/retrained/ for explicit review.
"""
import json
import os
import sys
from pathlib import Path
os.environ['TF_DETERMINISTIC_OPS']='1'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report,roc_auc_score
from scripts.evaluate import generate

tf.keras.utils.set_random_seed(42)
x,y=generate(42,1500)
train_x,test_x,train_y,test_y=train_test_split(x,y,test_size=.2,random_state=42,stratify=y)
train_x,val_x,train_y,val_y=train_test_split(train_x,train_y,test_size=.2,random_state=43,stratify=train_y)
scaler=StandardScaler().fit(train_x)
model=tf.keras.Sequential([tf.keras.layers.Input((6,)),tf.keras.layers.Dense(32,activation='relu'),tf.keras.layers.Dropout(.2),tf.keras.layers.Dense(16,activation='relu'),tf.keras.layers.Dense(8,activation='relu'),tf.keras.layers.Dense(1,activation='sigmoid')])
model.compile(optimizer=tf.keras.optimizers.Adam(.001),loss='binary_crossentropy',metrics=['accuracy'])
model.fit(scaler.transform(train_x),train_y,validation_data=(scaler.transform(val_x),val_y),epochs=100,batch_size=32,callbacks=[tf.keras.callbacks.EarlyStopping(patience=10,restore_best_weights=True)])
p=model.predict(scaler.transform(test_x),verbose=0).flatten()
out=Path('models/retrained');out.mkdir(exist_ok=True)
model.save(out/'model.keras')
weights=[dict(kernel=l.get_weights()[0].tolist(),bias=l.get_weights()[1].tolist()) for l in model.layers if len(l.get_weights())==2]
(out/'network.json').write_text(json.dumps(dict(mean=scaler.mean_.tolist(),scale=scaler.scale_.tolist(),layers=weights)),encoding='utf-8')
(out/'metrics.json').write_text(json.dumps({'report':classification_report(test_y,p>=.5,output_dict=True),'auc':roc_auc_score(test_y,p),'note':'Separate new training, not the supplied artifact'}),encoding='utf-8')
