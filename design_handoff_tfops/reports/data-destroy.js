// Sample run data for the tf9 Destroy report — includes a failed env.
window.RUN = {
  command: "destroy",
  runId: "run-0033",
  repo: "terraform-up-and-running",
  branch: "master",
  startedAt: "2026-06-07T01:09:12Z",
  duration: "2m 31s",
  results: [
    {
      env: "webserver-cluster",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 0, change: 0, destroy: 7,
      output: `aws_lb_listener_rule.asg: Destroying... [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:listener-rule/app/terraform-asg-lb/abcd1234/ef567890/aa11bb22]
aws_lb_listener_rule.asg: Destruction complete after 1s
aws_autoscaling_group.webserver_asg: Destroying... [id=terraform-20260607004200000100000003]
aws_lb_listener.http: Destroying... [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:listener/app/terraform-asg-lb/abcd1234/ef567890]
aws_lb_listener.http: Destruction complete after 1s
aws_autoscaling_group.webserver_asg: Still destroying... [00m10s elapsed]
aws_autoscaling_group.webserver_asg: Still destroying... [00m40s elapsed]
aws_autoscaling_group.webserver_asg: Destruction complete after 58s
aws_launch_configuration.webserver_lc: Destroying... [id=terraform-2026060700420001]
aws_lb_target_group.asg: Destroying... [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:targetgroup/terraform-asg-example]
aws_lb.webserver_lb: Destroying... [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:loadbalancer/app/terraform-asg-lb/abcd1234]
aws_launch_configuration.webserver_lc: Destruction complete after 1s
aws_lb_target_group.asg: Destruction complete after 1s
aws_lb.webserver_lb: Destruction complete after 2s
aws_security_group.alb: Destroying... [id=sg-0b1c2d3e4f5a6b7c8]
aws_security_group.alb: Destruction complete after 1s

Destroy complete! Resources: 7 destroyed.`
    },
    {
      env: "single-web-server",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 0, change: 0, destroy: 2,
      output: `aws_instance.webserver: Destroying... [id=i-091a2b3c4d5e6f7a8]
aws_instance.webserver: Still destroying... [00m10s elapsed]
aws_instance.webserver: Still destroying... [00m20s elapsed]
aws_instance.webserver: Destruction complete after 31s
aws_security_group.webserver: Destroying... [id=sg-04a1b2c3d4e5f6a7b]
aws_security_group.webserver: Destruction complete after 1s

Destroy complete! Resources: 2 destroyed.`
    },
    {
      env: "example-server",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 0, change: 0, destroy: 1,
      output: `aws_instance.example: Destroying... [id=i-0c8e3a1f9b2d4e6a7]
aws_instance.example: Still destroying... [00m10s elapsed]
aws_instance.example: Destruction complete after 30s

Destroy complete! Resources: 1 destroyed.`
    },
    {
      env: "s3",
      profile: "default",
      failed: true,
      noChanges: false,
      add: 0, change: 0, destroy: 0,
      output: `aws_s3_bucket_versioning.enabled: Destroying... [id=terraform-up-and-running-state-andres]
aws_s3_bucket_public_access_block.public_access: Destroying... [id=terraform-up-and-running-state-andres]
aws_s3_bucket_server_side_encryption_configuration.default: Destroying... [id=terraform-up-and-running-state-andres]
aws_dynamodb_table.terraform_locks: Destroying... [id=terraform-up-and-running-locks]
aws_s3_bucket_versioning.enabled: Destruction complete after 1s
aws_s3_bucket_public_access_block.public_access: Destruction complete after 1s
aws_s3_bucket_server_side_encryption_configuration.default: Destruction complete after 1s
aws_dynamodb_table.terraform_locks: Destruction complete after 2s
aws_s3_bucket.terraform_state: Destroying... [id=terraform-up-and-running-state-andres]

Error: deleting S3 Bucket (terraform-up-and-running-state-andres): operation
error S3: DeleteBucket, https response error StatusCode: 409, RequestID:
ABC123DEF456, HostID: examplehostid, api error BucketNotEmpty: The bucket you
tried to delete is not empty. You must delete all versions in the bucket.

  with aws_s3_bucket.terraform_state,
  on main.tf line 1, in resource "aws_s3_bucket" "terraform_state":
   1: resource "aws_s3_bucket" "terraform_state" {`
    }
  ]
};
