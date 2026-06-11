// Sample run data for the tfops Apply report.
window.RUN = {
  command: "apply",
  runId: "run-0032",
  repo: "terraform-up-and-running",
  branch: "master",
  startedAt: "2026-06-07T00:41:55Z",
  duration: "1m 48s",
  results: [
    {
      env: "s3",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 5, change: 0, destroy: 0,
      output: `aws_dynamodb_table.terraform_locks: Creating...
aws_s3_bucket.terraform_state: Creating...
aws_dynamodb_table.terraform_locks: Creation complete after 8s [id=terraform-up-and-running-locks]
aws_s3_bucket.terraform_state: Creation complete after 4s [id=terraform-up-and-running-state-andres]
aws_s3_bucket_public_access_block.public_access: Creating...
aws_s3_bucket_versioning.enabled: Creating...
aws_s3_bucket_server_side_encryption_configuration.default: Creating...
aws_s3_bucket_public_access_block.public_access: Creation complete after 1s [id=terraform-up-and-running-state-andres]
aws_s3_bucket_versioning.enabled: Creation complete after 1s [id=terraform-up-and-running-state-andres]
aws_s3_bucket_server_side_encryption_configuration.default: Creation complete after 2s [id=terraform-up-and-running-state-andres]

Apply complete! Resources: 5 added, 0 changed, 0 destroyed.

Outputs:

dynamodb_table_name = "terraform-up-and-running-locks"
s3_bucket_arn = "arn:aws:s3:::terraform-up-and-running-state-andres"`
    },
    {
      env: "example-server",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 1, change: 0, destroy: 0,
      output: `aws_instance.example: Creating...
aws_instance.example: Still creating... [00m10s elapsed]
aws_instance.example: Still creating... [00m20s elapsed]
aws_instance.example: Creation complete after 23s [id=i-0c8e3a1f9b2d4e6a7]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`
    },
    {
      env: "single-web-server",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 2, change: 0, destroy: 0,
      output: `aws_security_group.webserver: Creating...
aws_security_group.webserver: Creation complete after 3s [id=sg-04a1b2c3d4e5f6a7b]
aws_instance.webserver: Creating...
aws_instance.webserver: Still creating... [00m10s elapsed]
aws_instance.webserver: Still creating... [00m20s elapsed]
aws_instance.webserver: Creation complete after 24s [id=i-091a2b3c4d5e6f7a8]

Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

Outputs:

public_dns = "ec2-52-56-78-90.eu-west-2.compute.amazonaws.com"
public_ip = "52.56.78.90"`
    },
    {
      env: "webserver-cluster",
      profile: "default",
      failed: false,
      noChanges: false,
      add: 7, change: 0, destroy: 0,
      output: `data.aws_vpc.default: Reading...
data.aws_vpc.default: Read complete after 1s [id=vpc-0f95b57227e3622ac]
data.aws_subnets.default: Reading...
data.aws_subnets.default: Read complete after 1s [id=eu-west-2]
aws_security_group.alb: Creating...
aws_launch_configuration.webserver_lc: Creating...
aws_lb_target_group.asg: Creating...
aws_launch_configuration.webserver_lc: Creation complete after 2s [id=terraform-2026060700420001]
aws_security_group.alb: Creation complete after 3s [id=sg-0b1c2d3e4f5a6b7c8]
aws_lb_target_group.asg: Creation complete after 2s [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:targetgroup/terraform-asg-example]
aws_lb.webserver_lb: Creating...
aws_lb.webserver_lb: Still creating... [00m10s elapsed]
aws_lb.webserver_lb: Still creating... [00m20s elapsed]
aws_lb.webserver_lb: Still creating... [01m00s elapsed]
aws_lb.webserver_lb: Creation complete after 1m12s [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:loadbalancer/app/terraform-asg-lb/abcd1234]
aws_lb_listener.http: Creating...
aws_autoscaling_group.webserver_asg: Creating...
aws_lb_listener.http: Creation complete after 1s [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:listener/app/terraform-asg-lb/abcd1234/ef567890]
aws_lb_listener_rule.asg: Creating...
aws_lb_listener_rule.asg: Creation complete after 1s [id=arn:aws:elasticloadbalancing:eu-west-2:111122223333:listener-rule/app/terraform-asg-lb/abcd1234/ef567890/aa11bb22]
aws_autoscaling_group.webserver_asg: Still creating... [00m10s elapsed]
aws_autoscaling_group.webserver_asg: Still creating... [00m20s elapsed]
aws_autoscaling_group.webserver_asg: Creation complete after 27s [id=terraform-20260607004200000100000003]

Apply complete! Resources: 7 added, 0 changed, 0 destroyed.

Outputs:

alb_dns_name = "terraform-asg-lb-1234567890.eu-west-2.elb.amazonaws.com"`
    }
  ]
};
